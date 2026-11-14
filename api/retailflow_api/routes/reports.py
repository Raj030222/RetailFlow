"""Read-only, allowlisted report routes."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from retailflow_api.reports import ReportNotFound, ReportService
from retailflow_api.schemas import BenchmarkReportResponse, RunReportsResponse

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


def _service(request: Request) -> ReportService:
    return ReportService(request.app.state.settings)


@router.get("/runs/{batch_id}", response_model=RunReportsResponse)
def get_run_reports(
    batch_id: str,
    request: Request,
    mode: Literal["baseline", "optimized"] | None = Query(default=None),
) -> RunReportsResponse:
    try:
        return RunReportsResponse(**_service(request).run_reports(batch_id, mode))
    except ReportNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Report service is unavailable") from exc


@router.get("/benchmark", response_model=BenchmarkReportResponse)
def get_benchmark_reports(request: Request) -> BenchmarkReportResponse:
    try:
        return BenchmarkReportResponse(**_service(request).benchmark_reports())
    except ReportNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Report service is unavailable") from exc
