"""RetailFlow command line entry point."""
import argparse, json, logging, time, uuid
from pathlib import Path
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, explode, split, trim
from retailflow.config import load_config
from retailflow.generator.generate_data import generate
from retailflow.ingestion.reader import read_inputs
from retailflow.validation.quality_checks import classify
from retailflow.transformations import baseline, optimized
from retailflow.publishing.writer import PublicationError, publish
from retailflow.monitoring.metrics import utc_now, write_metrics

MISSING_REQUIRED_INPUT_EXIT = 2
VALIDATION_QUALITY_FAILURE_EXIT = 1

def _positive_repetitions(value):
    repetitions = int(value)
    if repetitions < 1:
        raise argparse.ArgumentTypeError("--repetitions must be at least 1")
    return repetitions

def spark_session(cfg):
    return (SparkSession.builder.master(cfg["spark_master"]).appName(cfg["spark_app_name"])
            .config("spark.sql.shuffle.partitions", cfg["shuffle_partitions"])
            .config("spark.sql.autoBroadcastJoinThreshold", cfg["broadcast_threshold_bytes"])
            .getOrCreate())


def _malformed_count(frame):
    if "_corrupt_record" not in frame.columns:
        return 0
    return frame.filter(col("_corrupt_record").isNotNull()).count()


def _duplicate_dimension_key_count(frame, key):
    return (frame.groupBy(key).count()
            .filter(col(key).isNotNull() & (col("count") > 1))
            .count())


def validate_inputs(cfg):
    spark = spark_session(cfg)
    try:
        customers, products, transactions = read_inputs(spark, cfg["input_dir"])
        valid, rejected, duplicates = classify(transactions, customers, products)
        input_count = transactions.count()
        valid_count = valid.count()
        rejected_count = rejected.count()
        # The classifier joins all matching rules with semicolons. Count each
        # reason occurrence so a row with multiple failures contributes to each.
        rejection_reason_counts = {
            row["rejection_reason"]: row["count"]
            for row in (
                rejected
                .select(explode(split(col("rejection_reason"), ";")).alias("rejection_reason"))
                .groupBy("rejection_reason")
                .count()
                .collect()
            )
        }
        duplicate_count = duplicates.count()
        malformed_counts = {
            "customers": _malformed_count(customers),
            "products": _malformed_count(products),
            "transactions": _malformed_count(transactions),
        }
        duplicate_dimension_keys = {
            "customers": _duplicate_dimension_key_count(customers, "customer_id"),
            "products": _duplicate_dimension_key_count(products, "product_id"),
        }
        missing_dimension_keys = {
            "customers": customers.filter(col("customer_id").isNull() | (trim(col("customer_id")) == "")).count(),
            "products": products.filter(col("product_id").isNull() | (trim(col("product_id")) == "")).count(),
        }
        reconciled = input_count == valid_count + rejected_count + duplicate_count
        has_quality_issues = (
            rejected_count > 0
            or duplicate_count > 0
            or sum(malformed_counts.values()) > 0
            or sum(duplicate_dimension_keys.values()) > 0
            or sum(missing_dimension_keys.values()) > 0
        )
        return {
            "status": "PASS" if reconciled and not has_quality_issues else "FAIL",
            "input_records": input_count,
            "valid_records": valid_count,
            "rejected_records": rejected_count,
            "rejection_reason_counts": rejection_reason_counts,
            "duplicate_records": duplicate_count,
            "malformed_records": sum(malformed_counts.values()),
            "malformed_records_by_dataset": malformed_counts,
            "duplicate_dimension_keys": duplicate_dimension_keys,
            "missing_dimension_keys": missing_dimension_keys,
            "reconciled": reconciled,
        }
    finally:
        spark.stop()


def run_pipeline(cfg, mode="both", batch_id=None):
    run_id = uuid.uuid4().hex; batch = batch_id or cfg["batch_id"]; started = utc_now(); t0 = time.perf_counter()
    spark = spark_session(cfg)
    publication_state = None
    publication_details = {}
    try:
        customers, products, tx = read_inputs(spark, cfg["input_dir"])
        customers = customers.withColumnRenamed("_source_path", "customer_source_path")
        products = products.withColumnRenamed("_source_path", "product_source_path")
        tx = tx.withColumn("run_id", __import__("pyspark.sql.functions", fromlist=["lit"]).lit(run_id))
        valid, rejected, duplicates = classify(tx, customers, products)
        chosen = baseline if mode == "baseline" else optimized
        outputs = chosen.transform(valid, customers, products)
        outputs["rejected_records"] = rejected
        outputs["duplicate_records"] = duplicates
        counts = {"input_records": tx.count(), "valid_records": valid.count(), "rejected_records": rejected.count(), "duplicate_records": duplicates.count(), "output_records": outputs["processed_transactions"].count()}
        summary = outputs["sales_summary"].first().asDict()
        unique_keys = outputs["processed_transactions"].select("transaction_id").distinct().count() == counts["output_records"]
        processed = outputs["processed_transactions"]
        customer_keys = customers.select("customer_id").distinct()
        product_keys = products.select("product_id").distinct()
        missing_customer = (processed.select("customer_id")
                            .join(customer_keys, "customer_id", "left_anti").limit(1).count() > 0)
        missing_product = (processed.select("product_id")
                           .join(product_keys, "product_id", "left_anti").limit(1).count() > 0)
        null_references = processed.filter("customer_id IS NULL OR product_id IS NULL").limit(1).count() > 0
        references_ok = not (null_references or missing_customer or missing_product)
        reconciled = counts["input_records"] == counts["valid_records"] + counts["rejected_records"] + counts["duplicate_records"]
        reconciliation = {"status": "PASS" if reconciled and unique_keys and references_ok else "FAIL", **counts,
                          "primary_key_unique": unique_keys, "referential_integrity": references_ok,
                          "total_revenue": str(summary["total_revenue"]), "total_units_sold": summary["total_units_sold"],
                          "baseline_vs_optimized": "not_compared" if mode != "both" else "see benchmark",
                          "mode": mode}
        write_metrics(str(Path(cfg["reports_dir"]) / f"{batch}_reconciliation.json"), reconciliation)
        if reconciliation["status"] != "PASS":
            raise RuntimeError(f"Pipeline reconciliation failed for batch {batch}")

        batch_root = str(Path(cfg["output_dir"]) / "runs" / batch)
        metrics = {"run_id": run_id, "batch_id": batch, "pipeline_name": "RetailFlow", "mode": mode, "start_time": started, "end_time": utc_now(), "execution_duration": time.perf_counter()-t0, **counts, "pipeline_status": "SUCCESS"}
        publication = publish(outputs, batch_root)
        publication_state = publication.state
        publication_details = {
            "publication_target": publication.target,
            "publication_backup_path": publication.backup_path,
            "publication_cleanup_error": publication.cleanup_error,
        }
        metrics.update({"publication_state": publication_state, **publication_details})
        write_metrics(str(Path(cfg["reports_dir"]) / f"{batch}_metrics.json"), metrics)
        logging.info("Run complete: %s", metrics); return metrics
    except Exception as exc:
        if isinstance(exc, PublicationError):
            publication_state = exc.publication_state
            publication_details = {"publication_backup_path": exc.backup_path}
        failure_metrics = {
            "run_id": run_id, "batch_id": batch, "start_time": started, "end_time": utc_now(),
            "execution_duration": time.perf_counter()-t0, "pipeline_status": "FAILED",
            "failure_reason": str(exc), "publication_state": publication_state, "mode": mode,
            **publication_details,
        }
        write_metrics(str(Path(cfg["reports_dir"]) / f"{batch}_metrics.json"), failure_metrics)
        logging.exception("Pipeline failed"); raise
    finally: spark.stop()

def main():
    p = argparse.ArgumentParser(prog="retailflow"); sub=p.add_subparsers(dest="command", required=True)
    g=sub.add_parser("generate"); g.add_argument("--records",type=int); g.add_argument("--invalid-percent",type=float); g.add_argument("--seed",type=int); g.add_argument("--duplicate-events",action=argparse.BooleanOptionalAction,default=True)
    r=sub.add_parser("run"); r.add_argument("--mode",choices=["baseline","optimized","both"],default="both"); r.add_argument("--batch-id")
    for cmd in ("validate","report"): sub.add_parser(cmd)
    b=sub.add_parser("benchmark"); b.add_argument("--records",type=int); b.add_argument("--repetitions",type=_positive_repetitions,default=3)
    a=p.parse_args(); cfg=load_config(); logging.basicConfig(level=getattr(logging,cfg["logging_level"],logging.INFO))
    if a.command == "generate":
        records = cfg["dataset_size"] if a.records is None else a.records
        print(generate(cfg["input_dir"], records, cfg["random_seed"] if a.seed is None else a.seed, cfg["invalid_percent"] if a.invalid_percent is None else a.invalid_percent, a.duplicate_events))
    elif a.command == "run":
        modes=["baseline","optimized"] if a.mode == "both" else [a.mode]
        # Each mode gets a distinct output location; deterministic input and batch are shared.
        for mode in modes:
            local = dict(cfg)
            if a.mode == "both":
                local["output_dir"] = str(Path(cfg["output_dir"]) / mode)
                local["reports_dir"] = str(Path(cfg["reports_dir"]) / mode)
            print(json.dumps(run_pipeline(local, mode, a.batch_id), indent=2))
    elif a.command == "validate":
        try:
            validation = validate_inputs(cfg)
        except FileNotFoundError as exc:
            print(json.dumps({"status": "FAIL", "error": str(exc)}, indent=2))
            raise SystemExit(MISSING_REQUIRED_INPUT_EXIT) from exc
        except ValueError as exc:
            print(json.dumps({"status": "FAIL", "error": str(exc)}, indent=2))
            raise SystemExit(VALIDATION_QUALITY_FAILURE_EXIT) from exc
        print(json.dumps(validation, indent=2))
        if validation["status"] != "PASS":
            raise SystemExit(VALIDATION_QUALITY_FAILURE_EXIT)
    elif a.command == "report":
        for f in Path(cfg["reports_dir"]).glob("*.json"): print(f.read_text(encoding="utf-8"))
    elif a.command == "benchmark":
        from retailflow.benchmarking.benchmark import benchmark
        records = cfg["dataset_size"] if a.records is None else a.records
        print(json.dumps(benchmark(cfg, records, a.repetitions),indent=2))

if __name__ == "__main__": main()
