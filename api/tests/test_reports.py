import json

from fastapi.testclient import TestClient

from retailflow_api.main import create_app
from helpers import FakeRunner, make_settings


def test_missing_reports_return_404_and_batch_traversal_is_rejected(tmp_path):
    app = create_app(make_settings(tmp_path), runner=FakeRunner())

    with TestClient(app) as client:
        missing = client.get("/api/v1/reports/runs/does-not-exist")
        traversal = client.get("/api/v1/reports/runs/%2E%2E%2Foutside")
        benchmark = client.get("/api/v1/reports/benchmark")

    assert missing.status_code == 404
    assert traversal.status_code == 404
    assert benchmark.status_code == 404


def test_run_reports_preserve_mode_separation_and_hide_absolute_paths(tmp_path):
    settings = make_settings(tmp_path)
    reports = settings.retailflow_root / "reports"
    outputs = settings.retailflow_root / "outputs"
    for mode in ("baseline", "optimized"):
        directory = reports / mode
        directory.mkdir(parents=True)
        metrics = {
            "mode": mode,
            "pipeline_status": "SUCCESS",
            "publication_target": str(outputs / mode / "runs" / "batch-one"),
            "publication_backup_path": str(outputs / mode / ".backup"),
        }
        (directory / "batch-one_metrics.json").write_text(json.dumps(metrics), encoding="utf-8")
        (directory / "batch-one_reconciliation.json").write_text(
            json.dumps({"mode": mode, "status": "PASS"}), encoding="utf-8"
        )
    app = create_app(settings, runner=FakeRunner())

    with TestClient(app) as client:
        response = client.get("/api/v1/reports/runs/batch-one")
        baseline = client.get("/api/v1/reports/runs/batch-one?mode=baseline")

    body = response.json()
    assert body["reports"]["baseline"]["metrics"]["mode"] == "baseline"
    assert body["reports"]["optimized"]["reconciliation"]["mode"] == "optimized"
    assert body["reports"]["baseline"]["metrics"]["publication_target"] == "baseline/runs/batch-one"
    assert baseline.json()["reports"]["baseline"]["metrics"]["mode"] == "baseline"
    assert str(settings.retailflow_root) not in response.text


def test_benchmark_json_csv_markdown_reports_are_allowlisted(tmp_path):
    settings = make_settings(tmp_path)
    reports = settings.retailflow_root / "reports"
    reports.mkdir()
    (reports / "benchmark_results.json").write_text(
        json.dumps({"equivalent": True, "repetitions": 2}), encoding="utf-8"
    )
    (reports / "benchmark_results.csv").write_text(
        "implementation,median_seconds\nbaseline,1.2\noptimized,1.0\n", encoding="utf-8"
    )
    (reports / "performance_report.md").write_text("# Benchmark\nEquivalent outputs.\n", encoding="utf-8")
    (reports / "private.txt").write_text("not exposed", encoding="utf-8")
    app = create_app(settings, runner=FakeRunner())

    with TestClient(app) as client:
        response = client.get("/api/v1/reports/benchmark")

    assert response.status_code == 200
    assert response.json()["json"]["equivalent"] is True
    assert "optimized,1.0" in response.json()["csv"]
    assert "Equivalent outputs" in response.json()["markdown"]
    assert "private" not in response.text


def test_report_symlink_cannot_escape_configured_report_root(tmp_path):
    settings = make_settings(tmp_path)
    reports = settings.retailflow_root / "reports"
    reports.mkdir()
    outside = tmp_path / "outside.json"
    outside.write_text('{"private": true}', encoding="utf-8")
    (reports / "batch_metrics.json").symlink_to(outside)
    app = create_app(settings, runner=FakeRunner())

    with TestClient(app) as client:
        response = client.get("/api/v1/reports/runs/batch")

    assert response.status_code == 404
