"""Typed HTTP request and response models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"


class RunMode(str, Enum):
    baseline = "baseline"
    optimized = "optimized"
    both = "both"


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class GenerateRequest(RequestModel):
    records: int | None = Field(default=None, ge=0)
    invalid_percent: float | None = Field(default=None, ge=0, le=1)
    duplicate_events: bool | None = None


class RunRequest(RequestModel):
    mode: RunMode = RunMode.both
    batch_id: str | None = None


class BenchmarkRequest(RequestModel):
    records: int | None = Field(default=None, ge=0)
    repetitions: int | None = Field(default=None, ge=1)


class ValidateRequest(RequestModel):
    pass


class JobSubmission(BaseModel):
    job_id: str
    job_type: str
    status: JobStatus
    created_at: datetime


class JobResponse(JobSubmission):
    started_at: datetime | None = None
    completed_at: datetime | None = None
    exit_code: int | None = None
    error_summary: str | None = None
    report_references: dict[str, list[str]]


class JobListResponse(BaseModel):
    jobs: list[JobResponse]


class JobLogsResponse(BaseModel):
    job_id: str
    stdout: str
    stderr: str
    truncated: bool


class HealthResponse(BaseModel):
    status: Literal["ok"]


class RunReport(BaseModel):
    metrics: dict[str, Any] | None = None
    reconciliation: dict[str, Any] | None = None


class RunReportsResponse(BaseModel):
    batch_id: str
    reports: dict[str, RunReport]


class BenchmarkReportResponse(BaseModel):
    benchmark_json: dict[str, Any] | None = Field(default=None, alias="json")
    csv: str | None = None
    markdown: str | None = None
