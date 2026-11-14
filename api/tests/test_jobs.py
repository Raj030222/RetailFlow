import time

import pytest
from fastapi.testclient import TestClient

from retailflow_api.jobs import JobManager
from retailflow_api.main import create_app
from retailflow_api.process_runner import ProcessInterrupted, ProcessTimeout
from retailflow_api.storage import JobStore
from helpers import FakeRunner, make_settings


def _wait_for_status(client, job_id, status):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200
        if response.json()["status"] == status:
            return response.json()
        time.sleep(0.02)
    pytest.fail(f"Job {job_id} did not reach {status}")


def test_job_submission_status_and_bounded_logs(tmp_path):
    settings = make_settings(tmp_path)
    app = create_app(settings, runner=FakeRunner())

    with TestClient(app) as client:
        submitted = client.post("/api/v1/jobs/generate", json={"records": 5})
        assert submitted.status_code == 202
        assert submitted.json()["status"] == "queued"
        job_id = submitted.json()["job_id"]
        result = _wait_for_status(client, job_id, "succeeded")
        logs = client.get(f"/api/v1/jobs/{job_id}/logs")

    assert result["exit_code"] == 0
    assert result["created_at"] and result["started_at"] and result["completed_at"]
    assert logs.status_code == 200
    assert "completed fake CLI" in logs.json()["stdout"]
    assert "fake warning" in logs.json()["stderr"]


def test_queue_serializes_generate_validate_and_run(tmp_path):
    runner = FakeRunner(delay=0.1)
    app = create_app(make_settings(tmp_path), runner=runner)

    with TestClient(app) as client:
        jobs = [
            client.post("/api/v1/jobs/generate", json={"records": 3}).json()["job_id"],
            client.post("/api/v1/jobs/validate", json={}).json()["job_id"],
            client.post("/api/v1/jobs/run", json={"mode": "baseline"}).json()["job_id"],
        ]
        for job_id in jobs:
            _wait_for_status(client, job_id, "succeeded")

    assert runner.max_active == 1
    assert runner.calls == [
        ["generate", "--records", "3"],
        ["validate"],
        ["run", "--mode", "baseline"],
    ]


def test_job_metadata_survives_backend_restart_and_stale_jobs_fail_safely(tmp_path):
    settings = make_settings(tmp_path)
    store = JobStore(settings.database_path, settings.max_log_chars)
    stale = store.create_job("a" * 32, "validate", {}, {})
    with store._connect() as connection:
        connection.execute(
            "UPDATE jobs SET status = 'running', started_at = ? WHERE job_id = ?",
            ("2026-01-01T00:00:00+00:00", stale["job_id"]),
        )

    first_app = create_app(settings, runner=FakeRunner())
    with TestClient(first_app) as first_client:
        submitted = first_client.post("/api/v1/jobs/validate", json={}).json()
        completed = _wait_for_status(first_client, submitted["job_id"], "succeeded")

    second_app = create_app(settings, runner=FakeRunner())
    with TestClient(second_app) as second_client:
        persisted = second_client.get(f"/api/v1/jobs/{completed['job_id']}").json()
        recovered_stale = second_client.get(f"/api/v1/jobs/{stale['job_id']}").json()

    assert persisted["status"] == "succeeded"
    assert recovered_stale["status"] == "failed"
    assert "state was not verified" in recovered_stale["error_summary"]


def test_verified_orphan_blocks_new_jobs_until_process_exits(tmp_path):
    settings = make_settings(tmp_path)
    store = JobStore(settings.database_path, settings.max_log_chars)
    orphan = store.create_job("b" * 32, "run", {}, {})
    store.set_process(orphan["job_id"], 24680, "retained-process-token")
    with store._connect() as connection:
        connection.execute(
            "UPDATE jobs SET status = 'running', started_at = ? WHERE job_id = ?",
            ("2026-01-01T00:00:00+00:00", orphan["job_id"]),
        )
    runner = FakeRunner(active_process=True)
    app = create_app(settings, runner=runner)

    with TestClient(app) as client:
        assert client.get(f"/api/v1/jobs/{orphan['job_id']}").json()["status"] == "running"
        queued = client.post("/api/v1/jobs/generate", json={"records": 3}).json()
        time.sleep(0.1)
        assert client.get(f"/api/v1/jobs/{queued['job_id']}").json()["status"] == "queued"
        assert runner.calls == []
        runner.active_process = False
        _wait_for_status(client, queued["job_id"], "succeeded")
        recovered = client.get(f"/api/v1/jobs/{orphan['job_id']}").json()

    assert recovered["status"] == "failed"
    assert "exit status is unknown" in recovered["error_summary"]


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/api/v1/jobs/generate", {"records": -1}),
        ("/api/v1/jobs/generate", {"records": 101}),
        ("/api/v1/jobs/run", {"mode": "shell", "batch_id": "safe"}),
        ("/api/v1/jobs/run", {"mode": "baseline", "batch_id": "../reports"}),
        ("/api/v1/jobs/benchmark", {"repetitions": 6}),
        ("/api/v1/jobs/validate", {"command": "anything"}),
    ],
)
def test_invalid_requests_are_rejected(tmp_path, path, payload):
    app = create_app(make_settings(tmp_path), runner=FakeRunner())

    with TestClient(app) as client:
        response = client.post(path, json=payload)

    assert response.status_code == 422


def test_nonzero_cli_exit_is_persisted_as_failed(tmp_path):
    app = create_app(make_settings(tmp_path), runner=FakeRunner(exit_code=3))

    with TestClient(app) as client:
        job_id = client.post("/api/v1/jobs/validate", json={}).json()["job_id"]
        result = _wait_for_status(client, job_id, "failed")

    assert result["exit_code"] == 3
    assert result["error_summary"] == "failure detail"


def test_validation_quality_failure_is_successful_execution(tmp_path):
    import json

    report = json.dumps({
        "status": "FAIL",
        "input_records": 3,
        "valid_records": 1,
        "rejected_records": 1,
        "duplicate_records": 1,
        "reconciled": True,
    })
    app = create_app(
        make_settings(tmp_path), runner=FakeRunner(exit_code=1, stdout=report)
    )

    with TestClient(app) as client:
        job_id = client.post("/api/v1/jobs/validate", json={}).json()["job_id"]
        result = _wait_for_status(client, job_id, "succeeded")

    assert result["exit_code"] == 1
    assert result["error_summary"] is None


def test_missing_validation_inputs_remain_execution_failure(tmp_path):
    app = create_app(make_settings(tmp_path), runner=FakeRunner(exit_code=2))

    with TestClient(app) as client:
        job_id = client.post("/api/v1/jobs/validate", json={}).json()["job_id"]
        result = _wait_for_status(client, job_id, "failed")

    assert result["exit_code"] == 2
    assert result["error_summary"] == "failure detail"


def test_exit_two_missing_input_report_is_execution_failure(tmp_path):
    import json

    report = json.dumps({
        "status": "FAIL",
        "error": "Missing required inputs: ['transactions.csv']",
    })
    app = create_app(
        make_settings(tmp_path),
        runner=FakeRunner(exit_code=2, stdout=report),
    )

    with TestClient(app) as client:
        job_id = client.post("/api/v1/jobs/validate", json={}).json()["job_id"]
        result = _wait_for_status(client, job_id, "failed")

    assert result["status"] == "failed"
    assert result["exit_code"] == 2
    assert result["error_summary"] == "failure detail"


def test_legacy_validation_exit_two_report_is_preserved_across_store_restarts(tmp_path):
    settings = make_settings(tmp_path)
    store = JobStore(settings.database_path, settings.max_log_chars)
    report = '{"status":"FAIL","input_records":10,"reconciled":true}'
    legacy = store.create_job("d" * 32, "validate", {}, {})
    stderr = "historical Spark diagnostic"
    store.finish_job(legacy["job_id"], "succeeded", 2, None, report, stderr)
    before = store.get_job(legacy["job_id"])
    # A late duplicate finalizer must not rewrite an already completed result.
    store.finish_job(
        legacy["job_id"], "failed", 2, "replacement error", "replacement stdout", "replacement stderr"
    )

    JobStore(settings.database_path, settings.max_log_chars)
    restarted_store = JobStore(settings.database_path, settings.max_log_chars)
    after = restarted_store.get_job(legacy["job_id"])

    assert after["status"] == "succeeded"
    assert after["exit_code"] == 2
    assert after["error_summary"] is None
    assert after["stdout"] == report
    assert after["stderr"] == stderr
    for field in (
        "job_id", "job_type", "created_at", "started_at", "completed_at",
        "report_references", "request_payload",
    ):
        assert after[field] == before[field]


def test_process_runner_reports_timeout_and_failure(monkeypatch, tmp_path):
    import io
    import subprocess
    import threading

    from retailflow_api.process_runner import ProcessRunner

    class FakeProcess:
        def __init__(self, *, stuck=False, code=0):
            self.pid = 12345
            self.stdout = io.StringIO("fake output\n")
            self.stderr = io.StringIO("fake error\n")
            self.returncode = None if stuck else code
            self.stuck = stuck
            self.terminated = False

        def poll(self):
            return None if self.stuck and not self.terminated else self.returncode

        def wait(self, timeout=None):
            if self.stuck and not self.terminated:
                raise subprocess.TimeoutExpired("fake", timeout)
            self.returncode = self.returncode if self.returncode is not None else -15
            return self.returncode

        def terminate(self):
            self.terminated = True
            self.returncode = -15

        def kill(self):
            self.terminated = True
            self.returncode = -9

    events = []
    runner = ProcessRunner(tmp_path, 20, 0)
    timed_process = FakeProcess(stuck=True)
    process_for_kill = [timed_process]
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: timed_process)
    monkeypatch.setattr(
        "os.killpg",
        lambda *_args: setattr(process_for_kill[0], "terminated", True),
    )
    with pytest.raises(ProcessTimeout):
        runner.run(
            ["validate"],
            lambda out, err: events.append((out, err)),
            threading.Event(),
            "test-token",
            lambda *_: None,
        )
    assert events

    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: FakeProcess(code=4))
    result = ProcessRunner(tmp_path, 20, 5).run(
        ["validate"], lambda *_: None, threading.Event(), "test-token", lambda *_: None
    )
    assert result.exit_code == 4
    assert result.stdout == "fake output\n"[-20:]
    assert result.stderr == "fake error\n"

    interrupted_process = FakeProcess(stuck=True)
    process_for_kill[0] = interrupted_process
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: interrupted_process)
    stop_event = threading.Event()
    stop_event.set()
    with pytest.raises(ProcessInterrupted):
        ProcessRunner(tmp_path, 20, 5).run(
            ["validate"], lambda *_: None, stop_event, "test-token", lambda *_: None
        )


def test_job_status_does_not_expose_request_payload(tmp_path):
    app = create_app(make_settings(tmp_path), runner=FakeRunner())

    with TestClient(app) as client:
        response = client.post("/api/v1/jobs/run", json={"mode": "baseline"})
        result = _wait_for_status(client, response.json()["job_id"], "succeeded")

    assert "request_payload" not in result
