"""Serialized, persistent job orchestration."""

from __future__ import annotations

import os
import json
import re
import threading
import uuid
from pathlib import Path
from typing import Any

from retailflow_api.config import Settings
from retailflow_api.process_runner import (
    ProcessInterrupted,
    ProcessRunner,
    ProcessTimeout,
)
from retailflow_api.storage import JobStore

BATCH_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
JOB_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


class InstanceLock:
    """Prevent two local API instances from draining the same persistent queue."""

    def __init__(self, path: Path):
        self.path = path
        self._stream = None

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._stream = self.path.open("a+")
        try:
            if os.name == "nt":
                import msvcrt

                self._stream.seek(0)
                msvcrt.locking(self._stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self._stream.close()
            self._stream = None
            raise RuntimeError("Another RetailFlow API instance owns the job queue") from exc

    def release(self) -> None:
        if self._stream is None:
            return
        if os.name == "nt":
            import msvcrt

            self._stream.seek(0)
            msvcrt.locking(self._stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(self._stream.fileno(), fcntl.LOCK_UN)
        self._stream.close()
        self._stream = None


class JobManager:
    def __init__(
        self,
        settings: Settings,
        store: JobStore | None = None,
        runner: Any | None = None,
    ):
        self.settings = settings
        self.store = store or JobStore(settings.database_path, settings.max_log_chars)
        self.runner = runner or ProcessRunner(
            settings.retailflow_root, settings.max_log_chars, settings.timeout_seconds
        )
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._instance_lock = InstanceLock(settings.lock_path)
        self._config = settings.load_pipeline_config()
        self._orphaned_job_ids: dict[str, tuple[int, str]] = {}

    def start(self) -> None:
        self._instance_lock.acquire()
        try:
            verifier = getattr(self.runner, "is_process_active", lambda _pid, _token: False)
            orphan_ids = self.store.recover_stale_jobs(verifier)
            self._orphaned_job_ids = {}
            for job_id in orphan_ids:
                orphan = self.store.get_job(job_id)
                self._orphaned_job_ids[job_id] = (
                    orphan["process_pid"],
                    orphan["process_token"],
                )
        except Exception:
            self._instance_lock.release()
            raise
        self._stop.clear()
        self._thread = threading.Thread(target=self._worker, name="retailflow-api-jobs", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread is not None:
            self._thread.join(timeout=15)
            if self._thread.is_alive():
                raise RuntimeError("RetailFlow job worker did not stop cleanly")
            self._thread = None
        self._instance_lock.release()

    def submit(self, job_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        if self._thread is None or not self._thread.is_alive():
            raise RuntimeError("Job service is not running")
        self._validate_payload(job_type, payload)
        job_id = uuid.uuid4().hex
        references = self._report_references(job_type, payload)
        job = self.store.create_job(job_id, job_type, references, payload)
        self._wake.set()
        return job

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        return self.store.get_job(job_id)

    def list_jobs(self, limit: int, offset: int) -> list[dict[str, Any]]:
        return self.store.list_jobs(limit, offset)

    def get_logs(self, job_id: str) -> tuple[str, str] | None:
        return self.store.get_logs(job_id)

    def _validate_payload(self, job_type: str, payload: dict[str, Any]) -> None:
        records = payload.get("records")
        if records is not None and records > self.settings.max_records:
            raise ValueError(f"records must not exceed {self.settings.max_records}")
        repetitions = payload.get("repetitions")
        if repetitions is not None and repetitions > self.settings.max_repetitions:
            raise ValueError(f"repetitions must not exceed {self.settings.max_repetitions}")
        batch_id = payload.get("batch_id")
        if batch_id is not None and not BATCH_ID_PATTERN.fullmatch(batch_id):
            raise ValueError("batch_id must contain 1-64 letters, digits, underscores, or hyphens")
        if job_type not in {"generate", "validate", "baseline", "optimized", "both", "benchmark"}:
            raise ValueError("Unsupported job type")

    def _report_references(self, job_type: str, payload: dict[str, Any]) -> dict[str, list[str]]:
        if job_type in {"baseline", "optimized", "both"}:
            batch_id = payload.get("batch_id") or str(self._config["batch_id"])
            modes = ("baseline", "optimized") if job_type == "both" else (job_type,)
            return {mode: [f"{batch_id}:metrics", f"{batch_id}:reconciliation"] for mode in modes}
        if job_type == "benchmark":
            return {"benchmark": ["benchmark_results.json", "benchmark_results.csv", "performance_report.md"]}
        return {}

    def _build_cli_args(self, job: dict[str, Any]) -> list[str]:
        kind = job["job_type"]
        payload = job.get("request_payload", {})
        if kind == "generate":
            args = ["generate"]
            if payload.get("records") is not None:
                args.extend(["--records", str(payload["records"])])
            if payload.get("invalid_percent") is not None:
                args.extend(["--invalid-percent", str(payload["invalid_percent"])])
            if payload.get("duplicate_events") is not None:
                args.append("--duplicate-events" if payload["duplicate_events"] else "--no-duplicate-events")
            return args
        if kind == "validate":
            return ["validate"]
        if kind in {"baseline", "optimized", "both"}:
            args = ["run", "--mode", kind]
            if payload.get("batch_id"):
                args.extend(["--batch-id", payload["batch_id"]])
            return args
        if kind == "benchmark":
            args = ["benchmark"]
            for key, flag in (("records", "--records"), ("repetitions", "--repetitions")):
                if payload.get(key) is not None:
                    args.extend([flag, str(payload[key])])
            return args
        raise ValueError("Unsupported job type")

    def _worker(self) -> None:
        while not self._stop.is_set():
            self._refresh_orphaned_jobs()
            if self._orphaned_job_ids:
                self._wake.wait(timeout=0.5)
                self._wake.clear()
                continue
            job = self.store.claim_next_job()
            if job is None:
                self._wake.wait(timeout=0.25)
                self._wake.clear()
                continue
            self._execute(job)

    def _execute(self, job: dict[str, Any]) -> None:
        stdout = ""
        stderr = ""
        process_token = uuid.uuid4().hex

        def save_logs(out: str, err: str) -> None:
            nonlocal stdout, stderr
            stdout = self._redact_paths(out)[-self.settings.max_log_chars :]
            stderr = self._redact_paths(err)[-self.settings.max_log_chars :]
            self.store.update_logs(job["job_id"], stdout, stderr)

        try:
            result = self.runner.run(
                self._build_cli_args(job),
                save_logs,
                self._stop,
                process_token,
                lambda pid, token: self.store.set_process(job["job_id"], pid, token),
            )
            stdout = self._redact_paths(result.stdout)[-self.settings.max_log_chars :]
            stderr = self._redact_paths(result.stderr)[-self.settings.max_log_chars :]
            if job["job_type"] == "validate" and self._is_validation_quality_failure(
                result.exit_code, stdout
            ):
                # A quality FAIL is a completed validation; input/configuration
                # errors still represent execution failure.
                self.store.finish_job(
                    job["job_id"], "succeeded", result.exit_code, None, stdout, stderr
                )
                return
            if result.exit_code == 0:
                self.store.finish_job(job["job_id"], "succeeded", 0, None, stdout, stderr)
            else:
                error = self._redact_paths(self._error_summary(stderr, result.exit_code))
                self.store.finish_job(job["job_id"], "failed", result.exit_code, error, stdout, stderr)
        except ProcessInterrupted:
            self.store.finish_job(job["job_id"], "cancelled", None, "Execution was interrupted", stdout, stderr)
        except ProcessTimeout as exc:
            self.store.finish_job(job["job_id"], "failed", None, str(exc), stdout, stderr)
        except Exception as exc:
            self.store.finish_job(
                job["job_id"], "failed", None, self._safe_exception(exc), stdout, stderr
            )

    def _refresh_orphaned_jobs(self) -> None:
        verifier = getattr(self.runner, "is_process_active", lambda _pid, _token: False)
        for job_id, (pid, token) in tuple(self._orphaned_job_ids.items()):
            job = self.store.get_job(job_id)
            if job is None:
                self._orphaned_job_ids.pop(job_id, None)
                continue
            active = verifier(pid, token)
            if active is True:
                continue
            if active is None:
                if job["status"] == "running":
                    self.store.finish_job(
                        job_id,
                        "failed",
                        None,
                        "Child process state became unverifiable; queued work remains blocked.",
                        job.get("stdout", ""),
                        job.get("stderr", ""),
                        clear_process=False,
                    )
                continue
            if job["status"] == "running":
                self.store.finish_job(
                    job_id,
                    "failed",
                    None,
                    "Child process ended while the API was unavailable; exit status is unknown.",
                    job.get("stdout", ""),
                    job.get("stderr", ""),
                )
            else:
                self.store.clear_process(job_id)
            self._orphaned_job_ids.pop(job_id, None)

    def _redact_paths(self, value: str) -> str:
        root = str(self.settings.retailflow_root.resolve())
        value = value.replace(root, "<RETAILFLOW_ROOT>")
        home = str(Path.home())
        if home and home != "/":
            value = value.replace(home, "<HOME>")
        return value

    @staticmethod
    def _is_validation_quality_failure(exit_code: int, stdout: str) -> bool:
        if exit_code != 1:
            return False
        try:
            report = json.loads(stdout)
        except (TypeError, ValueError):
            return False
        return (
            isinstance(report, dict)
            and report.get("status") == "FAIL"
            and isinstance(report.get("input_records"), int)
            and isinstance(report.get("reconciled"), bool)
        )

    @staticmethod
    def _error_summary(stderr: str, exit_code: int) -> str:
        lines = [line.rstrip() for line in stderr.splitlines()]
        meaningful = [line for line in lines if line.strip() and not re.search(
            r"(?:INFO|WARN(?:ING)?):.*(?:py4j|spark)|Closing down clientserver connection",
            line, re.IGNORECASE)]
        if meaningful:
            traceback_start = next((i for i, line in enumerate(meaningful)
                                    if line.strip().startswith("Traceback (most recent call last):")), None)
            if traceback_start is not None:
                meaningful = meaningful[traceback_start:]
            return "\n".join(meaningful[-12:])[-2000:]
        return f"RetailFlow CLI exited with code {exit_code}; no actionable stderr diagnostic was captured"

    def _safe_exception(self, exc: Exception) -> str:
        message = self._redact_paths(str(exc))
        return f"{type(exc).__name__}: {message[:500]}"
