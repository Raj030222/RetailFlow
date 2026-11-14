# RetailFlow

RetailFlow is a local PySpark data engineering project for reproducible synthetic retail data. It reads typed CSV inputs, classifies valid, rejected, and duplicate transactions, creates analytical Parquet outputs, and records reconciliation and run metrics. A FastAPI service and React console provide local job orchestration and report inspection.

## Requirements

- Python 3.10 or later
- Java 17
- Node.js 20 or later and npm (for the frontend)
- WSL2 Ubuntu is supported for the Python/Spark workflows; commands below assume the project is at `/mnt/d/RetailFlow`.

## Python setup

From WSL:

```bash
cd /mnt/d/RetailFlow
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export PYTHONPATH=src
java -version
```

Set `JAVA_HOME` if Java 17 is not already available on `PATH`. The API has separate dependencies:

```bash
python -m pip install -r api/requirements.txt
```

The project configuration is [config/pipeline_config.yaml](config/pipeline_config.yaml). Its default input, output, and report locations are `data/generated`, `outputs`, and `reports`.

## Generate, validate, and run

Run CLI commands from the repository root with the virtual environment activated and `PYTHONPATH=src`:

```bash
python -m retailflow.main generate --records 10000
python -m retailflow.main validate
python -m retailflow.main run --mode baseline
python -m retailflow.main run --mode optimized
python -m retailflow.main run --mode both
```

`generate` writes `customers.csv`, `products.csv`, and `transactions.csv` to the configured input directory. It generates reproducible synthetic data, including invalid transactions and a duplicate event by default. It overwrites those configured input files.

Validation execution status and data quality status are separate. A completed validation can exit successfully at the job/API level while its quality result is `FAIL`. CLI exit codes are 0 for validation PASS, 1 for validation quality FAIL, and 2 when required input files are missing. Rejected and duplicate transactions are separate categories: reconciliation is `valid + rejected + duplicate = input`. Rejection reasons are included as aggregate counts when reported; multiple reasons on one row can make their sum larger than the rejected-row count.

Baseline and optimized transformations read the same input data and write separate Parquet outputs. The benchmark also compares their output rows in both directions before presenting a performance comparison; an inequivalent or unavailable comparison does not support speedup or time-saved claims.

## API and frontend

Start the API in one WSL terminal:

```bash
cd /mnt/d/RetailFlow
source .venv/bin/activate
PYTHONPATH=src:api uvicorn retailflow_api.main:app --app-dir api --host 127.0.0.1 --port 8000
```

Check health at `http://127.0.0.1:8000/api/v1/health`. The API uses a persistent single-worker queue and a local SQLite state directory. Keep it bound to localhost; see [api/README.md](api/README.md) for configuration and security limitations.

In a second terminal, start the React console:

```bash
cd /mnt/d/RetailFlow/frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. The frontend reads the existing API and does not invoke shell commands or change Spark transformations. See [frontend/README.md](frontend/README.md) for page and API behavior.

## Benchmark

Use a small workload while checking changes:

```bash
python -m retailflow.main benchmark --records 1000 --repetitions 2
```

Benchmark artifacts use fixed filenames in `reports/`: `benchmark_results.json`, `benchmark_results.csv`, and `performance_report.md`. Save existing artifacts before running another benchmark. Benchmark timings are local observations affected by JVM warmup, filesystem cache, CPU load, and Spark settings; they are not production performance guarantees. Two repetitions are a small sample and should be treated as indicative only.

## Sample evidence

- `data/sample/` contains the existing 100-row synthetic fixture; `data/samples/phase2l_20261114/` is the exact 1,001-row input snapshot used for the sample validation and pipeline reports.
- `outputs/samples/phase2l_20261114/` contains representative baseline and optimized Parquet datasets from that verified workflow, including processed, rejected, and duplicate records.
- `reports/` contains captured validation, reconciliation, and benchmark reports. The benchmark JSON, CSV, and Markdown represent the same completed run.
- `data/generated/`, `outputs/runs/`, and `backups/` are local working/evidence directories and are excluded from Git. Curated samples are kept outside those ignored paths.

## Tests

Python checks in WSL:

```bash
cd /mnt/d/RetailFlow
source .venv/bin/activate
export PYTHONPATH=src
python -m pytest -q
python -m compileall -q src api tests
```

Frontend checks in PowerShell:

```powershell
cd D:\RetailFlow\frontend
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

## Design notes and limitations

See [architecture](docs/architecture.md), [data dictionary](docs/data_dictionary.md), [design tradeoffs](docs/design_tradeoffs.md), and the [operational guide](docs/operational_guide.md). Spark performs the relational transformations; Python handles configuration, orchestration, and reports.

The optimized path broadcasts customer and product dimensions, which is suitable only while they fit safely in executor memory. Publication is a local-filesystem, single-writer operation with retained backups, not a transactional multi-writer protocol. The API has no authentication and should not be exposed to a network without additional security controls. See the [API operations guide](api/README.md) for details.

In the current test environment, Starlette's `TestClient` emits a third-party deprecation warning because it references AnyIO's deprecated `anyio.abc.BlockingPortal` alias. The warning is in the installed Starlette dependency, not RetailFlow code; dependencies are not upgraded and the warning is not suppressed.
