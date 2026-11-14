"""SQLite persistence for API-owned job metadata and bounded logs."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStore:
    def __init__(self, database_path: Path, max_log_chars: int):
        self.database_path = database_path
        self.max_log_chars = max_log_chars
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    job_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    exit_code INTEGER,
                    error_summary TEXT,
                    report_references TEXT NOT NULL,
                    request_payload TEXT NOT NULL DEFAULT '{}',
                    process_pid INTEGER,
                    process_token TEXT,
                    stdout TEXT NOT NULL DEFAULT '',
                    stderr TEXT NOT NULL DEFAULT ''
                )
                """
            )
            columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(jobs)").fetchall()
            }
            if "request_payload" not in columns:
                connection.execute(
                    "ALTER TABLE jobs ADD COLUMN request_payload TEXT NOT NULL DEFAULT '{}'"
                )
            if "process_pid" not in columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN process_pid INTEGER")
            if "process_token" not in columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN process_token TEXT")

    def create_job(
        self,
        job_id: str,
        job_type: str,
        report_references: dict[str, list[str]],
        request_payload: dict[str, Any],
    ) -> dict[str, Any]:
        created_at = utc_now()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO jobs
                    (job_id, job_type, status, created_at, report_references, request_payload)
                VALUES (?, ?, 'queued', ?, ?, ?)
                """,
                (
                    job_id,
                    job_type,
                    created_at,
                    json.dumps(report_references, sort_keys=True),
                    json.dumps(request_payload, sort_keys=True),
                ),
            )
        return self.get_job(job_id)

    def recover_stale_jobs(self, process_is_active) -> list[str]:
        now = utc_now()
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT job_id, status, process_pid, process_token FROM jobs "
                "WHERE status IN ('queued', 'running') OR process_pid IS NOT NULL"
            ).fetchall()
        active: list[str] = []
        for row in rows:
            is_active = False
            if row["process_pid"] is not None:
                is_active = process_is_active(row["process_pid"], row["process_token"])
                if is_active is None:
                    raise RuntimeError(
                        "Cannot verify a previous RetailFlow child process; inspect it before restarting the API"
                    )
                if is_active:
                    active.append(row["job_id"])
                    continue
            if row["status"] == "failed":
                self.clear_process(row["job_id"])
                continue
            summary = (
                "Backend restarted before completion; prior execution state was not verified."
            )
            with self._connect() as connection:
                connection.execute(
                    """
                    UPDATE jobs
                    SET status = 'failed', completed_at = ?, error_summary = ?,
                        process_pid = NULL, process_token = NULL
                    WHERE job_id = ? AND status IN ('queued', 'running')
                    """,
                    (now, summary, row["job_id"]),
                )
        return active

    def set_process(self, job_id: str, process_pid: int, process_token: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE jobs SET process_pid = ?, process_token = ? WHERE job_id = ?",
                (process_pid, process_token, job_id),
            )

    def clear_process(self, job_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE jobs SET process_pid = NULL, process_token = NULL WHERE job_id = ?",
                (job_id,),
            )

    def claim_next_job(self) -> dict[str, Any] | None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT job_id FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1"
            ).fetchone()
            if row is None:
                connection.commit()
                return None
            connection.execute(
                "UPDATE jobs SET status = 'running', started_at = ? WHERE job_id = ? AND status = 'queued'",
                (utc_now(), row["job_id"]),
            )
            connection.commit()
        return self.get_job(row["job_id"])

    def update_logs(self, job_id: str, stdout: str, stderr: str) -> None:
        stdout = stdout[-self.max_log_chars :]
        stderr = stderr[-self.max_log_chars :]
        with self._connect() as connection:
            connection.execute(
                "UPDATE jobs SET stdout = ?, stderr = ? WHERE job_id = ?",
                (stdout, stderr, job_id),
            )

    def finish_job(
        self,
        job_id: str,
        status: str,
        exit_code: int | None,
        error_summary: str | None,
        stdout: str,
        stderr: str,
        clear_process: bool = True,
    ) -> None:
        with self._connect() as connection:
            process_fields = (
                ", process_pid = NULL, process_token = NULL" if clear_process else ""
            )
            connection.execute(
                f"""
                UPDATE jobs
                SET status = ?, completed_at = ?, exit_code = ?, error_summary = ?,
                    stdout = ?, stderr = ?{process_fields}
                WHERE job_id = ? AND status IN ('queued', 'running')
                """,
                (
                    status,
                    utc_now(),
                    exit_code,
                    error_summary,
                    stdout[-self.max_log_chars :],
                    stderr[-self.max_log_chars :],
                    job_id,
                ),
            )

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        return self._decode_row(row) if row else None

    def list_jobs(self, limit: int, offset: int) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        return [self._decode_row(row) for row in rows]

    def get_logs(self, job_id: str) -> tuple[str, str] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT stdout, stderr FROM jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
        return (row["stdout"], row["stderr"]) if row else None

    @staticmethod
    def _decode_row(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["report_references"] = json.loads(result["report_references"])
        result["request_payload"] = json.loads(result.pop("request_payload"))
        return result
