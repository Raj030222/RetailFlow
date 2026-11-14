"""API settings and trusted RetailFlow configuration loading."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


def _absolute_path(value: str, base: Path) -> Path:
    path = Path(value).expanduser()
    return (path if path.is_absolute() else base / path).resolve()


@dataclass(frozen=True)
class Settings:
    retailflow_root: Path
    pipeline_config: Path
    state_dir: Path
    timeout_seconds: int = 3600
    max_records: int = 1_000_000
    max_repetitions: int = 20
    max_log_chars: int = 256_000
    max_report_bytes: int = 2_000_000
    allowed_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )

    @property
    def database_path(self) -> Path:
        return self.state_dir / "jobs.sqlite3"

    @property
    def lock_path(self) -> Path:
        return self.retailflow_root / ".retailflow-api.lock"

    @classmethod
    def from_env(cls) -> "Settings":
        default_root = Path(__file__).resolve().parents[2]
        root = _absolute_path(os.environ.get("RETAILFLOW_ROOT", str(default_root)), default_root)
        config = _absolute_path(
            os.environ.get("RETAILFLOW_CONFIG", "config/pipeline_config.yaml"), root
        )
        state_dir = _absolute_path(
            os.environ.get(
                "RETAILFLOW_API_STATE_DIR",
                str(Path.home() / ".local" / "state" / "retailflow-api"),
            ),
            root,
        )
        origins = tuple(
            origin.strip()
            for origin in os.environ.get(
                "RETAILFLOW_API_ALLOWED_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if origin.strip()
        )
        return cls(
            retailflow_root=root,
            pipeline_config=config,
            state_dir=state_dir,
            timeout_seconds=int(os.environ.get("RETAILFLOW_API_TIMEOUT_SECONDS", "3600")),
            max_records=int(os.environ.get("RETAILFLOW_API_MAX_RECORDS", "1000000")),
            max_repetitions=int(os.environ.get("RETAILFLOW_API_MAX_REPETITIONS", "20")),
            max_log_chars=int(os.environ.get("RETAILFLOW_API_MAX_LOG_CHARS", "256000")),
            allowed_origins=origins,
        )

    def load_pipeline_config(self) -> dict[str, Any]:
        if not self.retailflow_root.is_dir():
            raise RuntimeError("Configured RetailFlow root does not exist")
        if not self.pipeline_config.is_file():
            raise RuntimeError("Configured RetailFlow configuration file does not exist")
        try:
            config = yaml.safe_load(self.pipeline_config.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError) as exc:
            raise RuntimeError("Unable to load RetailFlow configuration") from exc
        if not isinstance(config, dict):
            raise RuntimeError("RetailFlow configuration must be a mapping")
        for key in ("input_dir", "output_dir", "reports_dir", "dataset_size", "batch_id"):
            if key not in config:
                raise RuntimeError(f"RetailFlow configuration is missing {key}")
        return config

    def configured_directory(self, key: str, config: dict[str, Any] | None = None) -> Path:
        pipeline_config = config or self.load_pipeline_config()
        path = _absolute_path(str(pipeline_config[key]), self.retailflow_root)
        try:
            path.relative_to(self.retailflow_root)
        except ValueError as exc:
            raise RuntimeError(f"Configured {key} must remain inside the RetailFlow root") from exc
        return path
