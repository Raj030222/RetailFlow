"""Allowlisted, size-limited access to RetailFlow reports."""

from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path
from typing import Any

from retailflow_api.config import Settings

BATCH_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
REPORT_MODES = ("baseline", "optimized")


class ReportNotFound(Exception):
    pass


class ReportService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.config = settings.load_pipeline_config()
        self.reports_root = settings.configured_directory("reports_dir", self.config)
        self.outputs_root = settings.configured_directory("output_dir", self.config)

    def run_reports(self, batch_id: str, mode: str | None = None) -> dict[str, Any]:
        if not BATCH_ID_PATTERN.fullmatch(batch_id):
            raise ReportNotFound("Run reports not found")
        if mode not in (None, *REPORT_MODES):
            raise ReportNotFound("Run reports not found")

        locations: list[tuple[str, Path]]
        if mode:
            locations = [(mode, self.reports_root / mode), ("default", self.reports_root)]
        else:
            locations = [(name, self.reports_root / name) for name in REPORT_MODES]
            locations.append(("default", self.reports_root))

        reports: dict[str, dict[str, Any]] = {}
        for label, directory in locations:
            metrics_path = directory / f"{batch_id}_metrics.json"
            reconciliation_path = directory / f"{batch_id}_reconciliation.json"
            metrics = self._read_json(metrics_path)
            reconciliation = self._read_json(reconciliation_path)
            if metrics is not None or reconciliation is not None:
                reports[label] = {
                    "metrics": self._sanitize_json(metrics),
                    "reconciliation": self._sanitize_json(reconciliation),
                }
        if not reports:
            raise ReportNotFound("Run reports not found")
        return {"batch_id": batch_id, "reports": reports}

    def benchmark_reports(self) -> dict[str, Any]:
        json_path = self.reports_root / "benchmark_results.json"
        csv_path = self.reports_root / "benchmark_results.csv"
        markdown_path = self.reports_root / "performance_report.md"
        benchmark_json = self._read_json(json_path)
        benchmark_csv = self._read_text(csv_path)
        markdown = self._read_text(markdown_path)
        if benchmark_json is None and benchmark_csv is None and markdown is None:
            raise ReportNotFound("Benchmark reports not found")
        if benchmark_csv is not None:
            try:
                rows = list(csv.DictReader(io.StringIO(benchmark_csv)))
            except csv.Error as exc:
                raise ReportNotFound("Benchmark CSV report is invalid") from exc
            benchmark_csv = self._serialize_csv(rows, benchmark_csv)
        return {
            "json": self._sanitize_json(benchmark_json),
            "csv": benchmark_csv,
            "markdown": markdown,
        }

    def _read_json(self, path: Path) -> dict[str, Any] | None:
        text = self._read_text(path)
        if text is None:
            return None
        try:
            value = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ReportNotFound("Report JSON is invalid") from exc
        if not isinstance(value, dict):
            raise ReportNotFound("Report JSON has an unexpected shape")
        return value

    def _read_text(self, path: Path) -> str | None:
        try:
            resolved = path.resolve(strict=True)
            resolved.relative_to(self.reports_root)
        except (FileNotFoundError, ValueError):
            return None
        if not resolved.is_file() or resolved.stat().st_size > self.settings.max_report_bytes:
            raise ReportNotFound("Report is unavailable or exceeds the response size limit")
        return resolved.read_text(encoding="utf-8")

    def _sanitize_json(self, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        clean = dict(value)
        for key in ("publication_target", "publication_backup_path"):
            path_value = clean.get(key)
            if not isinstance(path_value, str):
                continue
            try:
                resolved = Path(path_value).resolve()
                clean[key] = resolved.relative_to(self.outputs_root).as_posix()
            except (OSError, ValueError):
                clean[key] = None
        return clean

    @staticmethod
    def _serialize_csv(rows: list[dict[str, str]], original: str) -> str:
        if not rows:
            return original
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        return stream.getvalue()
