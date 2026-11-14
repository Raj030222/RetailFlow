# RetailFlow API

The API is a separate local orchestration layer. It invokes the existing RetailFlow CLI in child processes and stores only API job metadata and bounded logs in SQLite. It does not import or rewrite the Spark transformations.

## Installation and startup

Use the Python environment that already contains RetailFlow and Java 17:

```bash
cd /mnt/d/RetailFlow
source "$HOME/.venvs/retailflow/bin/activate"
python -m pip install -r requirements.txt
python -m pip install -r api/requirements.txt
PYTHONPATH=api uvicorn retailflow_api.main:app --app-dir api --host 127.0.0.1 --port 8000
```

The API binds to localhost in this example. The child process uses the same interpreter as Uvicorn (`sys.executable`), runs from the RetailFlow repository root, and receives `src` on `PYTHONPATH`. The pipeline configuration remains the existing `config/pipeline_config.yaml`; API clients cannot select a config file or filesystem path.

Environment settings are server-side only:

| Variable | Default | Purpose |
|---|---|---|
| `RETAILFLOW_ROOT` | Repository root | Trusted RetailFlow project root |
| `RETAILFLOW_CONFIG` | `config/pipeline_config.yaml` under root | Trusted pipeline config file |
| `RETAILFLOW_API_STATE_DIR` | `~/.local/state/retailflow-api` | SQLite job metadata |
| `RETAILFLOW_API_TIMEOUT_SECONDS` | `3600` | Per-CLI-process timeout |
| `RETAILFLOW_API_MAX_RECORDS` | `1000000` | Maximum requested records |
| `RETAILFLOW_API_MAX_REPETITIONS` | `20` | Maximum benchmark repetitions |
| `RETAILFLOW_API_MAX_LOG_CHARS` | `256000` | Per-stream retained log limit |
| `RETAILFLOW_API_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS origins |

Configured input, output, report, and API-state paths are resolved by the server. Report roots must remain within the trusted RetailFlow root.

## Endpoints

All endpoints are prefixed by `/api/v1`.

| Method and path | Description |
|---|---|
| `GET /health` | API health |
| `POST /jobs/generate` | Queue synthetic data generation |
| `POST /jobs/validate` | Queue standalone input validation |
| `POST /jobs/run` | Queue baseline, optimized, or both pipeline modes |
| `POST /jobs/benchmark` | Queue the existing benchmark command |
| `GET /jobs` | List jobs (`limit` 1–100, `offset` >= 0) |
| `GET /jobs/{job_id}` | Get persisted status and report references |
| `GET /jobs/{job_id}/logs` | Get bounded stdout/stderr |
| `GET /reports/runs/{batch_id}?mode=baseline` | Read run metrics and reconciliation; `mode` may be baseline or optimized |
| `GET /reports/benchmark` | Read known benchmark JSON, CSV, and Markdown reports |

The run report endpoint without `mode` returns available baseline, optimized, and single-mode reports separately. Missing reports return `404`. The API returns report contents, not arbitrary file access; absolute publication paths in metric JSON are converted to paths relative to the configured output root.

### Request examples

```bash
curl -X POST http://127.0.0.1:8000/api/v1/jobs/generate \
  -H 'Content-Type: application/json' \
  -d '{"records": 5000, "invalid_percent": 0.02}'

curl -X POST http://127.0.0.1:8000/api/v1/jobs/validate \
  -H 'Content-Type: application/json' -d '{}'

curl -X POST http://127.0.0.1:8000/api/v1/jobs/run \
  -H 'Content-Type: application/json' \
  -d '{"mode": "both", "batch_id": "local-check-01"}'

curl -X POST http://127.0.0.1:8000/api/v1/jobs/benchmark \
  -H 'Content-Type: application/json' \
  -d '{"records": 5000, "repetitions": 3}'
```

Generation accepts optional `records` and `invalid_percent`; validation accepts an empty JSON object; run accepts `mode` (`baseline`, `optimized`, `both`) and optional `batch_id`; benchmark accepts optional `records` and `repetitions`. Extra fields, invalid ranges, over-limit requests, and unsafe batch IDs are rejected.

### Response examples

Submission returns HTTP `202`:

```json
{
  "job_id": "acbd18db4cc2f85cedef654fccc4a4d8",
  "job_type": "baseline",
  "status": "queued",
  "created_at": "2026-11-13T00:00:00+00:00"
}
```

The job status response includes `queued`, `running`, `succeeded`, `failed`, or `cancelled`; created/started/completed timestamps; exit code; error summary; and report references. `GET /jobs/{job_id}/logs` returns bounded `stdout`, `stderr`, and a truncation flag. Report payloads preserve the underlying CLI JSON fields rather than synthesizing pipeline metrics.

## Job lifecycle and reliability

Submissions are written to SQLite before returning. A single background worker claims queued jobs in order and invokes the fixed command form:

```text
<sys.executable> -m retailflow.main <allowlisted CLI arguments>
```

No shell is used, and request data cannot supply command names, environment variables, or file paths. The API captures output, stores bounded logs, records exit status, and enforces a timeout. It serializes generation, validation, both pipeline modes, and benchmarking because they share inputs, Spark resources, and single-writer publication.

SQLite persists job metadata across API restarts. Queued work is marked `failed` rather than replayed. A previously running CLI process is checked against its persisted PID, unique process token, command, and working directory. If verified active, its job remains `running` and new work stays queued until that process exits; the eventual exit is marked `failed` because the API cannot recover its exit status. If the process state cannot be verified, API startup fails closed for operator inspection. The API never kills an unverified process. A local OS lock at `<RETAILFLOW_ROOT>/.retailflow-api.lock` prevents another API instance for that project root from draining the queue, even if its SQLite state directory differs.

## Security and operational limitations

- Keep the service bound to localhost. Do not expose it on a network without adding authentication, authorization, CSRF defenses, and deployment-specific hardening.
- CORS is restricted to the configured local frontend origins and can be overridden only through server environment configuration.
- Clients can request only fixed CLI operations and known report names. Batch IDs are restricted and report file resolution is constrained to the configured report root; symlink escapes are rejected.
- Job logs and report sizes are bounded. Internal environment variables are never returned; project/home paths in job logs are redacted.
- This is a local, single-writer service. Do not run multiple API instances against the same RetailFlow paths or use concurrent independent CLI writers.
- Existing CLI commands may overwrite configured generated input or a matching batch/report. The queue prevents overlap within this API, not writes by external processes.
- Retained publication backups and benchmark outputs remain governed by the existing CLI. This API does not add cleanup, recovery, cancellation, or dataset-download endpoints.
