"""Job submission and status routes."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status

from retailflow_api.jobs import JOB_ID_PATTERN, JobManager
from retailflow_api.schemas import (
    BenchmarkRequest,
    GenerateRequest,
    JobListResponse,
    JobLogsResponse,
    JobResponse,
    JobSubmission,
    RunRequest,
    ValidateRequest,
)

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


def _manager(request: Request) -> JobManager:
    return request.app.state.job_manager


def _response(row: dict[str, Any]) -> JobResponse:
    return JobResponse(**row)


def _submit(manager: JobManager, kind: str, payload: dict[str, Any]) -> JobSubmission:
    try:
        row = manager.submit(kind, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Job service is unavailable") from exc
    return JobSubmission(**row)


@router.post("/generate", response_model=JobSubmission, status_code=status.HTTP_202_ACCEPTED)
def submit_generate(body: GenerateRequest, request: Request) -> JobSubmission:
    return _submit(_manager(request), "generate", body.model_dump(exclude_none=True))


@router.post("/validate", response_model=JobSubmission, status_code=status.HTTP_202_ACCEPTED)
def submit_validate(body: ValidateRequest, request: Request) -> JobSubmission:
    return _submit(_manager(request), "validate", {})


@router.post("/run", response_model=JobSubmission, status_code=status.HTTP_202_ACCEPTED)
def submit_run(body: RunRequest, request: Request) -> JobSubmission:
    return _submit(
        _manager(request),
        body.mode.value,
        body.model_dump(exclude_none=True, mode="json"),
    )


@router.post("/benchmark", response_model=JobSubmission, status_code=status.HTTP_202_ACCEPTED)
def submit_benchmark(body: BenchmarkRequest, request: Request) -> JobSubmission:
    return _submit(_manager(request), "benchmark", body.model_dump(exclude_none=True))


@router.get("", response_model=JobListResponse)
def list_jobs(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> JobListResponse:
    return JobListResponse(jobs=[_response(row) for row in _manager(request).list_jobs(limit, offset)])


@router.get("/{job_id}/logs", response_model=JobLogsResponse)
def get_job_logs(job_id: str, request: Request) -> JobLogsResponse:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    logs = _manager(request).get_logs(job_id)
    if logs is None:
        raise HTTPException(status_code=404, detail="Job not found")
    stdout, stderr = logs
    return JobLogsResponse(
        job_id=job_id,
        stdout=stdout,
        stderr=stderr,
        truncated=len(stdout) >= request.app.state.settings.max_log_chars
        or len(stderr) >= request.app.state.settings.max_log_chars,
    )


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str, request: Request) -> JobResponse:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    row = _manager(request).get_job(job_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _response(row)
