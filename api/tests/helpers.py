from pathlib import Path

import yaml

from retailflow_api.config import Settings


def make_settings(tmp_path: Path, *, max_records: int = 100) -> Settings:
    root = tmp_path / "retailflow"
    root.mkdir(exist_ok=True)
    config_dir = root / "config"
    config_dir.mkdir(exist_ok=True)
    config_path = config_dir / "pipeline_config.yaml"
    config_path.write_text(
        yaml.safe_dump(
            {
                "input_dir": "data/generated",
                "output_dir": "outputs",
                "reports_dir": "reports",
                "dataset_size": 5,
                "random_seed": 7,
                "invalid_percent": 0.1,
                "batch_id": "api-test",
                "spark_master": "local[1]",
                "spark_app_name": "RetailFlow-api-tests",
                "shuffle_partitions": 1,
                "broadcast_threshold_bytes": 10485760,
                "benchmark_repetitions": 2,
                "logging_level": "INFO",
            }
        ),
        encoding="utf-8",
    )
    return Settings(
        retailflow_root=root,
        pipeline_config=config_path,
        state_dir=tmp_path / "api-state",
        timeout_seconds=30,
        max_records=max_records,
        max_repetitions=5,
        max_log_chars=1024,
        max_report_bytes=100_000,
    )


class FakeRunner:
    def __init__(
        self,
        *,
        delay: float = 0,
        exit_code: int = 0,
        active_process: bool = False,
        stdout: str | None = None,
    ):
        import threading

        self.delay = delay
        self.exit_code = exit_code
        self.stdout = stdout
        self.calls = []
        self.active = 0
        self.max_active = 0
        self.lock = threading.Lock()
        self.active_process = active_process

    def is_process_active(self, _pid, _token):
        return self.active_process

    def run(self, args, on_logs, stop_event, process_token, on_started):
        import time
        from retailflow_api.process_runner import ProcessResult

        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            self.calls.append(args)
        try:
            on_started(12345, process_token)
            on_logs("started fake CLI\n", "fake warning\n")
            end = time.monotonic() + self.delay
            while time.monotonic() < end:
                if stop_event.is_set():
                    from retailflow_api.process_runner import ProcessInterrupted

                    raise ProcessInterrupted("stopped")
                time.sleep(0.005)
            return ProcessResult(
                self.exit_code,
                self.stdout or "started fake CLI\ncompleted fake CLI\n",
                "failure detail\n" if self.exit_code else "fake warning\n",
            )
        finally:
            with self.lock:
                self.active -= 1
