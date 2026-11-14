"""Safe subprocess execution for the existing RetailFlow CLI."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


class ProcessTimeout(RuntimeError):
    pass


class ProcessInterrupted(RuntimeError):
    pass


class ProcessLaunchError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProcessResult:
    exit_code: int
    stdout: str
    stderr: str


class _BoundedOutput:
    def __init__(self, limit: int, on_update: Callable[[str, str], None]):
        self.limit = limit
        self.on_update = on_update
        self.stdout = ""
        self.stderr = ""
        self.lock = threading.Lock()
        self.pending = 0
        self.callback_error: Exception | None = None

    def append(self, stream: str, chunk: str) -> None:
        if not chunk:
            return
        with self.lock:
            current = getattr(self, stream)
            current = (current + chunk)[-self.limit :]
            setattr(self, stream, current)
            self.pending += len(chunk)
            if self.pending >= 4096 and self.callback_error is None:
                self.pending = 0
                try:
                    self.on_update(self.stdout, self.stderr)
                except Exception as exc:
                    self.callback_error = exc

    def snapshot(self) -> tuple[str, str]:
        with self.lock:
            self.pending = 0
            return self.stdout, self.stderr

    def raise_callback_error(self) -> None:
        if self.callback_error is not None:
            raise RuntimeError("Unable to persist subprocess logs") from self.callback_error


class ProcessRunner:
    def __init__(self, retailflow_root: Path, max_log_chars: int, timeout_seconds: int):
        self.root = retailflow_root.resolve()
        self.source_dir = self.root / "src"
        self.max_log_chars = max_log_chars
        self.timeout_seconds = timeout_seconds

    def run(
        self,
        cli_args: list[str],
        on_logs: Callable[[str, str], None],
        stop_event: threading.Event,
        process_token: str,
        on_started: Callable[[int, str], None],
    ) -> ProcessResult:
        if not cli_args or any(not isinstance(value, str) for value in cli_args):
            raise ValueError("CLI arguments must be a non-empty list of strings")
        env = os.environ.copy()
        existing_pythonpath = env.get("PYTHONPATH")
        env["PYTHONPATH"] = os.pathsep.join(
            [str(self.source_dir)] + ([existing_pythonpath] if existing_pythonpath else [])
        )
        env["RETAILFLOW_API_PROCESS_TOKEN"] = process_token
        try:
            process = subprocess.Popen(
                [sys.executable, "-m", "retailflow.main", *cli_args],
                cwd=self.root,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                start_new_session=(os.name != "nt"),
            )
        except OSError as exc:
            raise ProcessLaunchError("Unable to start the RetailFlow CLI process") from exc
        try:
            on_started(process.pid, process_token)
        except Exception:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            raise

        output = _BoundedOutput(self.max_log_chars, on_logs)

        def drain(stream, name: str) -> None:
            try:
                for line in iter(lambda: stream.readline(4096), ""):
                    output.append(name, line)
            finally:
                stream.close()

        readers = [
            threading.Thread(target=drain, args=(process.stdout, "stdout"), daemon=True),
            threading.Thread(target=drain, args=(process.stderr, "stderr"), daemon=True),
        ]
        for reader in readers:
            reader.start()

        deadline = time.monotonic() + self.timeout_seconds
        interrupted = False
        timed_out = False
        try:
            while process.poll() is None:
                if stop_event.is_set():
                    interrupted = True
                    break
                if time.monotonic() >= deadline:
                    timed_out = True
                    break
                time.sleep(0.1)
        except KeyboardInterrupt:
            interrupted = True

        if interrupted or timed_out:
            if os.name != "nt":
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            else:
                process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                if os.name != "nt":
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                else:
                    process.kill()
                process.wait()
        else:
            process.wait()

        for reader in readers:
            reader.join(timeout=5)
        stdout, stderr = output.snapshot()
        on_logs(stdout, stderr)
        output.raise_callback_error()
        if interrupted:
            raise ProcessInterrupted("RetailFlow CLI process was interrupted")
        if timed_out:
            raise ProcessTimeout(f"RetailFlow CLI exceeded the {self.timeout_seconds}-second timeout")
        return ProcessResult(process.returncode, stdout, stderr)

    def is_process_active(self, pid: int | None, token: str | None) -> bool | None:
        if pid is None or not token:
            return False
        if os.name != "posix" or not Path("/proc").is_dir():
            return None
        proc = Path("/proc") / str(pid)
        if not proc.exists():
            return False
        try:
            command = (proc / "cmdline").read_bytes()
            environment = (proc / "environ").read_bytes()
            working_directory = (proc / "cwd").resolve()
        except (OSError, PermissionError):
            return None
        expected_command = b"-m\x00retailflow.main\x00"
        expected_token = f"RETAILFLOW_API_PROCESS_TOKEN={token}".encode()
        return (
            expected_command in command
            and expected_token in environment.split(b"\x00")
            and working_directory == self.root
        )
