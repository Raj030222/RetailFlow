"""Measured baseline versus broadcast transformation benchmark."""
import csv
import json
import os
import shutil
import statistics
import tempfile
import time
from pathlib import Path

from pyspark import StorageLevel

from retailflow.ingestion.reader import read_inputs
from retailflow.validation.quality_checks import classify
from retailflow.transformations import baseline, optimized
from retailflow.main import spark_session


_ARTIFACT_NAMES = (
    "benchmark_results.json",
    "benchmark_results.csv",
    "performance_report.md",
)
_CSV_FIELDS = [
    "implementation", "records", "repetitions", "median_seconds",
    "output_records", "output_counts", "plan", "equivalent",
    "improvement_percent", "performance_assessment", "performance_note",
]


def _write_success_artifacts(directory: Path, results: dict) -> None:
    (directory / "benchmark_results.json").write_text(
        json.dumps(results, indent=2, default=str), encoding="utf-8"
    )
    with (directory / "benchmark_results.csv").open(
        "w", newline="", encoding="utf-8"
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=_CSV_FIELDS)
        writer.writeheader()
        for name in ("baseline", "optimized"):
            result = results[name]
            writer.writerow({
                "implementation": name,
                "records": results["records"],
                "repetitions": results["repetitions"],
                "median_seconds": result["median_seconds"],
                "output_records": result["output_records"],
                "output_counts": json.dumps(result["output_counts"], sort_keys=True),
                "plan": result["plan"],
                "equivalent": results.get("equivalent"),
                "improvement_percent": results["improvement_percent"],
                "performance_assessment": results["performance_assessment"],
                "performance_note": results["performance_note"],
            })
    equivalent = results.get("equivalent")
    assessment = results["performance_assessment"]
    if equivalent is False:
        comparison = "comparison invalid"
        equivalence_statement = (
            "Performance improvement, speedup, and time-saved claims are withheld "
            "because outputs are not equivalent."
        )
    elif equivalent is True:
        equivalence_statement = f"Equivalent outputs: {equivalent}."
        if assessment == "insufficient_repetitions":
            comparison = "not assessed (insufficient repetitions)"
        else:
            improvement = results["improvement_percent"]
            comparison = f"{improvement:.4f}%" if improvement is not None else "not assessed"
    else:
        comparison = "not assessed"
        equivalence_statement = (
            "Comparative performance claims cannot be made because output equivalence "
            "could not be established."
        )
    (directory / "performance_report.md").write_text(
        f"# Performance report\n\nInput: {results['records']}; repetitions: {results['repetitions']}.\n\n"
        f"Baseline median: {results['baseline']['median_seconds']:.4f}s. "
        f"Optimized median: {results['optimized']['median_seconds']:.4f}s. "
        f"Observed change: {comparison}. {equivalence_statement}\n\n"
        f"{results['performance_note']}\n\n"
        "This local benchmark is indicative only; output equivalence is checked using "
        "bidirectional row comparisons.\n",
        encoding="utf-8",
    )


def _validate_staged_artifacts(directory: Path) -> None:
    for name in _ARTIFACT_NAMES:
        path = directory / name
        if not path.is_file() or path.stat().st_size == 0:
            raise OSError(f"Benchmark artifact is missing or empty: {name}")
    with (directory / "benchmark_results.json").open(encoding="utf-8") as stream:
        json.load(stream)
    with (directory / "benchmark_results.csv").open(
        newline="", encoding="utf-8"
    ) as stream:
        rows = list(csv.DictReader(stream))
        if len(rows) != 2:
            raise OSError("Benchmark CSV must contain baseline and optimized rows")


def _publish_success_artifacts(report: Path, results: dict) -> None:
    """Stage and validate a report set, then replace it with rollback on failure."""
    report.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".benchmark-", dir=report) as temp_name:
        staging = Path(temp_name)
        staged = staging / "staged"
        staged.mkdir()
        backups = staging / "backups"
        backups.mkdir()
        _write_success_artifacts(staged, results)
        _validate_staged_artifacts(staged)

        existing = {name: (report / name).exists() for name in _ARTIFACT_NAMES}
        replaced = []
        try:
            # Same-directory temporary replacements keep each individual file atomic.
            for name in _ARTIFACT_NAMES:
                target = report / name
                if existing[name]:
                    shutil.copy2(target, backups / name)
                os.replace(staged / name, target)
                replaced.append(name)
        except Exception:
            for name in reversed(replaced):
                target = report / name
                backup = backups / name
                if existing[name] and backup.exists():
                    os.replace(backup, target)
                else:
                    target.unlink(missing_ok=True)
            raise


def _root_error(exc: Exception) -> Exception:
    root = exc
    seen = set()
    while root.__cause__ is not None and id(root) not in seen:
        seen.add(id(root))
        root = root.__cause__
    return root


def benchmark(cfg: dict, records: int, repetitions: int = 3) -> dict:
    from retailflow.generator.generate_data import generate

    if repetitions < 1:
        raise ValueError("Benchmark repetitions must be at least 1")

    stage = "dataset_generation"
    implementation = None
    repetition = None
    spark = None
    cached = []
    try:
        generate(cfg["input_dir"], records, cfg["random_seed"], cfg["invalid_percent"])
        stage = "spark_session_startup"
        spark = spark_session(cfg)
        stage = "input_read"
        customers, products, transactions = read_inputs(spark, cfg["input_dir"])
        # Materialize shared inputs before any timed transformation actions.
        stage = "input_cache_materialization"
        for frame in (customers, products):
            if hasattr(frame, "persist"):
                cached.append(frame)
                frame.persist(StorageLevel.MEMORY_AND_DISK)
                frame.count()
        valid, _, _ = classify(transactions, customers, products)
        if hasattr(valid, "persist"):
            cached.append(valid)
            valid.persist(StorageLevel.MEMORY_AND_DISK)
            valid.count()

        performance_assessment = "insufficient_repetitions" if repetitions < 2 else "observed_only"
        results = {}
        materialized = {}
        for name, module in (("baseline", baseline), ("optimized", optimized)):
            implementation = name
            elapsed = []
            counts = None
            plan = None
            for repetition in range(1, repetitions + 1):
                stage = "transformation_and_count"
                start = time.perf_counter()
                frames = module.transform(valid, customers, products)
                counts = {key: frame.count() for key, frame in frames.items()}
                elapsed.append(time.perf_counter() - start)
                plan = frames["processed_transactions"]._jdf.queryExecution().executedPlan().toString()[:4000]
            results[name] = {
                "median_seconds": statistics.median(elapsed),
                "output_records": counts["processed_transactions"],
                "output_counts": counts,
                "plan": plan,
            }
            materialized[name] = frames

        implementation = None
        repetition = None
        stage = "output_equivalence_reconciliation"
        comparisons = []
        for key in materialized["baseline"]:
            left = materialized["baseline"][key]
            right = materialized["optimized"][key]
            comparisons.append(
                left.exceptAll(right).limit(1).count() == 0
                and right.exceptAll(left).limit(1).count() == 0
            )
        equivalent = all(comparisons)
        improvement_percent = None
        if equivalent and repetitions >= 2:
            baseline_seconds = results["baseline"]["median_seconds"]
            optimized_seconds = results["optimized"]["median_seconds"]
            if baseline_seconds > 0 and optimized_seconds is not None:
                improvement_percent = (
                    baseline_seconds - optimized_seconds
                ) / baseline_seconds * 100

        results.update({
            "equivalent": equivalent,
            "records": records,
            "repetitions": repetitions,
            "improvement_percent": improvement_percent,
            "performance_assessment": performance_assessment,
            "performance_note": (
                "Local timings are sensitive to JVM warmup, filesystem cache, machine load, "
                "and partition settings. A single repetition is insufficient to assess "
                "performance improvement."
            ),
        })
        stage = "resource_cleanup"
        cleanup_error = None
        for frame in reversed(cached):
            try:
                frame.unpersist(blocking=False)
            except Exception as cleanup_exc:
                cleanup_error = cleanup_error or cleanup_exc
        cached.clear()
        if spark is not None:
            try:
                spark.stop()
            except Exception as cleanup_exc:
                cleanup_error = cleanup_error or cleanup_exc
            spark = None
        if cleanup_error is not None:
            raise RuntimeError(
                f"Benchmark cleanup failed: {type(cleanup_error).__name__}: {str(cleanup_error)[:500]}"
            ) from cleanup_error
        stage = "report_publication"
        _publish_success_artifacts(Path(cfg["reports_dir"]), results)
        try:
            (Path(cfg["reports_dir"]) / "benchmark_failure.json").unlink(missing_ok=True)
        except OSError:
            # A stale diagnostic must not turn a successfully published run into failure.
            pass
        return results
    except Exception as exc:
        root = _root_error(exc)
        diagnostic = {
            "status": "FAILED",
            "records": records,
            "repetitions": repetitions,
            "failure": {
                "stage": stage,
                "implementation": implementation,
                "repetition": repetition,
                "exception_type": type(exc).__name__,
                "root_error": f"{type(root).__name__}: {str(root)[:500]}",
            },
        }
        # Keep the prior complete success report set intact. This diagnostic is
        # separate so consumers cannot combine it with CSV/Markdown from another run.
        diagnostic_temp = None
        try:
            report = Path(cfg["reports_dir"])
            report.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=report,
                prefix=".benchmark-failure-", suffix=".tmp", delete=False,
            ) as stream:
                diagnostic_temp = Path(stream.name)
                json.dump(diagnostic, stream, indent=2)
            os.replace(diagnostic_temp, report / "benchmark_failure.json")
        except Exception as report_exc:
            if diagnostic_temp is not None:
                try:
                    diagnostic_temp.unlink(missing_ok=True)
                except OSError:
                    pass
            diagnostic["failure"]["diagnostic_write_error"] = (
                f"{type(report_exc).__name__}: {str(report_exc)[:300]}"
            )
        raise RuntimeError(
            f"Benchmark failed during {stage}"
            + (f" ({implementation}, repetition {repetition})" if implementation else "")
            + f": {type(root).__name__}: {str(root)[:500]}"
        ) from exc
    finally:
        for frame in reversed(cached):
            try:
                frame.unpersist(blocking=False)
            except Exception:  # cleanup must not mask the benchmark exception
                pass
        if spark is not None:
            try:
                spark.stop()
            except Exception:
                pass
