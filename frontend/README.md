# RetailFlow frontend

React 19 + TypeScript console for the local RetailFlow FastAPI service. The UI uses only the existing API; it does not invoke shell commands or modify pipeline code.

## Start locally

Start the API in a terminal from the project root using the existing Python environment:

```bash
source "$HOME/.venvs/retailflow/bin/activate"
PYTHONPATH=api uvicorn retailflow_api.main:app --app-dir api --host 127.0.0.1 --port 8000
```

Then start the frontend in a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The frontend API base defaults to `http://127.0.0.1:8000`; set `VITE_API_BASE_URL` in a local `.env` to override it. The API binds to localhost by default and configures CORS for local Vite origins. See [the API operations guide](../api/README.md) for backend environment settings and security limitations.

## Pipeline Execution page

Open `/pipeline` from the sidebar. Each operation requires explicit confirmation before it is submitted:

- **Generate dataset** submits `POST /api/v1/jobs/generate` with record count and invalid fraction. It can replace configured generated input files.
- **Validate data** submits `POST /api/v1/jobs/validate`. A queued HTTP response is not a validation result; PASS/FAIL is shown only when supported by the captured stdout JSON.
- **Baseline**, **optimized**, and **both** submit `POST /api/v1/jobs/run` with the selected mode and optional batch ID. These operations publish outputs; the both-mode CLI runs both transformations sequentially.
- **Benchmark** submits `POST /api/v1/jobs/benchmark` with record count and repetitions. It is resource-intensive, can rewrite configured generated inputs, and replaces the fixed benchmark report.

The operation forms use defaults of 10,000 records, 3% invalid data, and 3 benchmark repetitions. Numeric input is validated in the browser. The API default request limits are 1,000,000 records and 20 repetitions; deployments can override these on the API, so server responses remain authoritative. Generation and benchmark record counts accept zero according to the existing API schema.

## Monitoring and logs

The console reads `GET /api/v1/jobs?limit=100&offset=0`, then uses `GET /api/v1/jobs/{job_id}` and `GET /api/v1/jobs/{job_id}/logs` for details. Status values are the API’s `queued`, `running`, `succeeded`, `failed`, and `cancelled`. It refreshes job history while jobs are active, slows polling when idle, and pauses scheduled refresh while the tab is hidden. Selected active jobs have their details/logs refreshed periodically; logs are returned snapshots, not a streaming connection. The API exposes separate bounded stdout and stderr but no per-line timestamps.

The API is a persistent single-worker queue: generation, validation, pipeline runs, and benchmarks execute one at a time. The page prevents duplicate matching submissions made in this page while they remain active. The API does not expose previous request payloads, so duplicate requests submitted outside this page cannot be matched reliably. The console does not offer cancellation because no cancellation endpoint exists.

The job list endpoint returns at most 100 records per call, supports offset-based loading, and has no total-count field. The console can load older pages on request, but never presents loaded records as a complete historical total; a refresh returns to the newest page. The benchmark report endpoint exposes the current fixed report rather than a report keyed by job ID, so after later benchmarks it may no longer correspond to an older successful benchmark job. A successful benchmark creates its JSON, CSV, and Markdown artifacts from the same result and stages and validates the set before publication, with rollback if replacement fails. The report has no producing job ID or independent generation timestamp, so historical attribution remains unavailable. Benchmark values and improvement percentages are taken from the report; no improvement claim is made when the report indicates insufficient repetitions or inequivalent outputs.

## Checks

Run the frontend checks from `frontend/`:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
