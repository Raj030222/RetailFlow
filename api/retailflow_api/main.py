"""FastAPI application for safely orchestrating the RetailFlow CLI."""

from __future__ import annotations

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from retailflow_api.config import Settings
from retailflow_api.jobs import JobManager
from retailflow_api.routes.jobs import router as jobs_router
from retailflow_api.routes.reports import router as reports_router
from retailflow_api.schemas import HealthResponse
from retailflow_api.storage import JobStore


def create_app(settings: Settings | None = None, runner=None) -> FastAPI:
    api_settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        api_settings.state_dir.mkdir(parents=True, exist_ok=True)
        store = JobStore(api_settings.database_path, api_settings.max_log_chars)
        manager = JobManager(api_settings, store=store, runner=runner)
        manager.start()
        app.state.job_manager = manager
        try:
            yield
        finally:
            manager.stop()

    app = FastAPI(title="RetailFlow API", version="1.0.0", lifespan=lifespan)
    app.state.settings = api_settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(api_settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.include_router(jobs_router)
    app.include_router(reports_router)

    @app.get("/api/v1/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        return HealthResponse(status="ok")

    return app


app = create_app()
