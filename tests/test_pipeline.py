import csv
import json
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from collections import Counter

import pytest
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lit, when

from retailflow import main as main_module
from retailflow.benchmarking import benchmark as benchmark_module
from retailflow.generator.generate_data import generate
from retailflow.ingestion.reader import read_inputs
from retailflow.publishing.writer import PublicationResult, publish
from retailflow.schemas import CUSTOMER_SCHEMA, PRODUCT_SCHEMA, TRANSACTION_SCHEMA
from retailflow.transformations import baseline, optimized
from retailflow.validation.quality_checks import classify


@pytest.fixture(scope="module")
def spark():
    session = (SparkSession.builder.master("local[1]").appName("retailflow-tests")
               .config("spark.ui.enabled", "false")
               .config("spark.sql.shuffle.partitions", "1")
               .getOrCreate())
    yield session
    session.stop()


def customer(customer_id="C1", name="Customer"):
    return (customer_id, name, "customer@example.test", "Pune", "MH", None, None, None)


def product(product_id="P1", price="2.00"):
    return (product_id, f"Product {product_id}", "Home", Decimal(price), 10, None, None)


def transaction(transaction_id="T1", customer_id="C1", product_id="P1", quantity=1,
                transaction_time=datetime(2024, 1, 1), ingestion_time=datetime(2024, 1, 1, 0, 1),
                source_file="transactions.csv", run_id="r1", corrupt_record=None):
    return (transaction_id, customer_id, product_id, quantity, transaction_time,
            ingestion_time, source_file, run_id, corrupt_record)


def test_valid_reject_duplicate_classification(spark):
    customers = spark.createDataFrame([customer()], CUSTOMER_SCHEMA)
    products = spark.createDataFrame([product()], PRODUCT_SCHEMA)
    transactions = spark.createDataFrame([
        transaction(), transaction(),
        transaction("T2", customer_id="C9", quantity=2),
    ], TRANSACTION_SCHEMA)

    valid, rejected, duplicates = classify(transactions, customers, products)

    assert (valid.count(), rejected.count(), duplicates.count()) == (1, 1, 1)


def test_validation_report_reconciles_valid_rejected_and_duplicate_buckets(
    spark, monkeypatch
):
    customers = spark.createDataFrame([customer()], CUSTOMER_SCHEMA)
    products = spark.createDataFrame([product()], PRODUCT_SCHEMA)
    transactions = spark.createDataFrame([
        transaction("T1"),
        transaction("T1"),
        transaction("T2", customer_id="UNKNOWN"),
    ], TRANSACTION_SCHEMA)
    monkeypatch.setattr(spark, "stop", lambda: None)
    monkeypatch.setattr(main_module, "spark_session", lambda _cfg: spark)
    monkeypatch.setattr(
        main_module, "read_inputs", lambda *_args: (customers, products, transactions)
    )

    report = main_module.validate_inputs({"input_dir": "unused"})

    assert report["input_records"] == 3
    assert report["valid_records"] == 1
    assert report["rejected_records"] == 1
    assert report["duplicate_records"] == 1
    assert report["valid_records"] + report["rejected_records"] == 2
    assert (
        report["valid_records"]
        + report["rejected_records"]
        + report["duplicate_records"]
        == report["input_records"]
    )
    assert report["reconciled"] is True


def test_validation_report_counts_each_rejection_reason_and_reason_combination(
    spark, monkeypatch
):
    malformed_customer = list(customer("C-MAL"))
    malformed_customer[-1] = "malformed customer row"
    customers = spark.createDataFrame(
        [
            customer(), customer("C-DUP", "First"), customer("C-DUP", "Second"),
            tuple(malformed_customer),
        ],
        CUSTOMER_SCHEMA,
    )
    malformed_product = list(product("P-MAL"))
    malformed_product[-1] = "malformed product row"
    products = spark.createDataFrame(
        [
            product(), product("P-DUP"), product("P-DUP", "3.00"),
            tuple(malformed_product), product("P-NEG", "-1.00"),
        ],
        PRODUCT_SCHEMA,
    )
    cases = [
        ("malformed_csv_record", transaction("R-malformed", corrupt_record="raw,row")),
        ("missing_transaction_id", transaction(None)),
        ("missing_customer_id", transaction("R-missing-customer", customer_id=None)),
        ("invalid_customer_reference", transaction("R-invalid-customer", customer_id="C-UNKNOWN")),
        ("duplicate_customer_id", transaction("R-duplicate-customer", customer_id="C-DUP")),
        ("malformed_customer_record", transaction("R-malformed-customer", customer_id="C-MAL")),
        ("missing_product_id", transaction("R-missing-product", product_id=None)),
        ("invalid_product_reference", transaction("R-invalid-product", product_id="P-UNKNOWN")),
        ("duplicate_product_id", transaction("R-duplicate-product", product_id="P-DUP")),
        ("malformed_product_record", transaction("R-malformed-product", product_id="P-MAL")),
        ("invalid_product_price", transaction("R-invalid-price", product_id="P-NEG")),
        ("missing_or_malformed_quantity", transaction("R-missing-quantity", quantity=None)),
        ("negative_quantity", transaction("R-negative", quantity=-1)),
        ("zero_quantity", transaction("R-zero", quantity=0)),
        ("invalid_transaction_timestamp", transaction("R-invalid-time", transaction_time=None)),
    ]
    # One record can retain multiple rules in the classifier's joined value.
    cases.append(("combined", transaction("R-combined", customer_id="")))
    transactions = spark.createDataFrame([row for _, row in cases], TRANSACTION_SCHEMA)
    monkeypatch.setattr(spark, "stop", lambda: None)
    monkeypatch.setattr(main_module, "spark_session", lambda _cfg: spark)
    monkeypatch.setattr(
        main_module, "read_inputs", lambda *_args: (customers, products, transactions)
    )

    report = main_module.validate_inputs({"input_dir": "unused"})

    expected = {reason: 1 for reason, _ in cases if reason != "combined"}
    expected["missing_customer_id"] = 2
    expected["invalid_customer_reference"] = 2
    assert report["rejected_records"] == len(cases)
    assert report["rejection_reason_counts"] == expected
    assert sum(report["rejection_reason_counts"].values()) == report["rejected_records"] + 1


def test_duplicate_customer_and_product_keys_reject_referencing_transactions(spark):
    customers = spark.createDataFrame([
        customer("C1", "First"), customer("C1", "Second"), customer("C2"),
    ], CUSTOMER_SCHEMA)
    products = spark.createDataFrame([
        product("P1", "2.00"), product("P1", "3.00"), product("P2", "4.00"),
    ], PRODUCT_SCHEMA)
    transactions = spark.createDataFrame([
        transaction("T-CUSTOMER", customer_id="C1", product_id="P2"),
        transaction("T-PRODUCT", customer_id="C2", product_id="P1"),
    ], TRANSACTION_SCHEMA)

    valid, rejected, duplicates = classify(transactions, customers, products)
    rejection_reasons = {
        row.transaction_id: row.rejection_reason
        for row in rejected.select("transaction_id", "rejection_reason").collect()
    }

    assert valid.count() == 0
    assert duplicates.count() == 0
    assert rejection_reasons == {
        "T-CUSTOMER": "duplicate_customer_id",
        "T-PRODUCT": "duplicate_product_id",
    }


def test_malformed_csv_record_is_preserved_and_quarantined(spark, tmp_path):
    (tmp_path / "customers.csv").write_text(
        "customer_id,customer_name,email,city,state,registration_date,created_at\n"
        "C1,Customer,customer@example.test,Pune,MH,2023-01-01,2023-01-01 00:00:00\n",
        encoding="utf-8",
    )
    (tmp_path / "products.csv").write_text(
        "product_id,product_name,category,unit_price,stock_quantity,created_at\n"
        "P1,Product,Home,2.00,10,2023-01-01 00:00:00\n",
        encoding="utf-8",
    )
    (tmp_path / "transactions.csv").write_text(
        "transaction_id,customer_id,product_id,quantity,transaction_timestamp,ingestion_timestamp,source_file,run_id\n"
        "T-BAD,C1,P1,not-a-number,2024-01-01 00:00:00,2024-01-01 00:01:00,transactions.csv,r1\n",
        encoding="utf-8",
    )

    customers, products, transactions = read_inputs(spark, str(tmp_path))
    _, rejected, _ = classify(transactions, customers, products)
    row = rejected.select("_corrupt_record", "rejection_reason").first()

    assert row._corrupt_record.startswith("T-BAD,C1,P1,not-a-number")
    assert "malformed_csv_record" in row.rejection_reason
    assert "missing_or_malformed_quantity" in row.rejection_reason


def test_duplicate_winner_uses_stable_source_and_payload_tiebreakers(spark):
    customers = spark.createDataFrame([customer()], CUSTOMER_SCHEMA)
    products = spark.createDataFrame([product("P1"), product("P2"), product("P3")], PRODUCT_SCHEMA)
    rows = [
        transaction("T-DUP", product_id="P1", source_file="transactions.csv"),
        transaction("T-DUP", product_id="P2", source_file="transactions.csv"),
    ]
    transactions = (spark.createDataFrame(rows, TRANSACTION_SCHEMA)
                    .withColumn("_source_path", when(
                        col("product_id") == "P1", "file:///z/transactions.csv"
                    ).otherwise("file:///a/transactions.csv")))
    valid, _, duplicates = classify(transactions, customers, products)
    assert valid.select("product_id").first().product_id == "P2"
    assert duplicates.count() == 1

    tied_rows = [
        transaction("T-TIE", product_id="P2"),
        transaction("T-TIE", product_id="P1"),
    ]
    tied = (spark.createDataFrame(tied_rows, TRANSACTION_SCHEMA)
            .withColumn("_source_path", lit("file:///same.csv")))
    expected_winner = None
    for candidate in (tied, tied.orderBy("product_id", ascending=False)):
        winner, _, _ = classify(candidate, customers, products)
        product_id = winner.select("product_id").first().product_id
        expected_winner = expected_winner or product_id
        assert product_id == expected_winner == "P1"


def test_generated_duplicate_pair_is_valid_and_has_deterministic_winner(spark, tmp_path):
    result = generate(str(tmp_path), records=20, seed=77, invalid_percent=0.1)
    with Path(result["transaction_file"]).open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    id_counts = Counter(row["transaction_id"] for row in rows)
    repeated_ids = {transaction_id for transaction_id, count in id_counts.items() if count > 1}

    assert result["valid_duplicate_pairs"] == 1
    assert len(repeated_ids) == 1
    duplicate_id = repeated_ids.pop()
    duplicate_rows = [row for row in rows if row["transaction_id"] == duplicate_id]
    assert len(duplicate_rows) == 2
    assert duplicate_rows[0]["transaction_timestamp"] != duplicate_rows[1]["transaction_timestamp"]

    customers, products, transactions = read_inputs(spark, str(tmp_path))
    valid, rejected, duplicates = classify(transactions, customers, products)
    winning = valid.filter(col("transaction_id") == duplicate_id).first()
    losing = duplicates.filter(col("transaction_id") == duplicate_id).first()
    assert winning is not None
    assert losing is not None
    assert rejected.filter(col("transaction_id") == duplicate_id).count() == 0
    assert winning.transaction_timestamp < losing.transaction_timestamp


def test_baseline_and_optimized_outputs_match_and_publish_parquet(spark, tmp_path):
    customers = spark.createDataFrame([customer()], CUSTOMER_SCHEMA)
    products = spark.createDataFrame([product("P1", "2.00"), product("P2", "4.00")], PRODUCT_SCHEMA)
    transactions = spark.createDataFrame([
        transaction("T1", product_id="P1", quantity=3),
        transaction("T2", product_id="P2", quantity=1),
    ], TRANSACTION_SCHEMA)
    valid, rejected, duplicates = classify(transactions, customers, products)

    baseline_outputs = baseline.transform(valid, customers, products)
    optimized_outputs = optimized.transform(valid, customers, products)
    for name in baseline_outputs:
        assert baseline_outputs[name].exceptAll(optimized_outputs[name]).count() == 0
        assert optimized_outputs[name].exceptAll(baseline_outputs[name]).count() == 0

    summary = baseline_outputs["sales_summary"].first()
    assert summary.total_revenue == Decimal("10.00")
    assert baseline_outputs["processed_transactions"].count() == 2
    assert rejected.count() == 0
    assert duplicates.count() == 0

    outputs = dict(baseline_outputs)
    outputs["rejected_records"] = rejected
    outputs["duplicate_records"] = duplicates
    target = tmp_path / "published"
    publish(outputs, str(target))
    parquet_rows = spark.read.parquet(str(target / "processed_transactions")).collect()
    assert len(parquet_rows) == 2
    assert {row.total_amount for row in parquet_rows} == {Decimal("6.00"), Decimal("4.00")}


@pytest.mark.parametrize("failure", ["reconciliation", "integrity"])
def test_failed_reconciliation_or_integrity_does_not_publish(spark, monkeypatch, tmp_path, failure):
    customers = spark.createDataFrame([customer()], CUSTOMER_SCHEMA)
    products = spark.createDataFrame([product()], PRODUCT_SCHEMA)
    transactions = spark.createDataFrame([transaction()], TRANSACTION_SCHEMA)
    empty = transactions.limit(0)
    published = []

    class SparkStub:
        def stop(self):
            pass

    batch = f"failed-{failure}"
    config = {
        "batch_id": batch,
        "input_dir": str(tmp_path / "input"),
        "output_dir": str(tmp_path / "outputs"),
        "reports_dir": str(tmp_path / "reports"),
    }
    monkeypatch.setattr(main_module, "spark_session", lambda _: SparkStub())
    monkeypatch.setattr(main_module, "read_inputs", lambda *_: (customers, products, transactions))
    if failure == "reconciliation":
        monkeypatch.setattr(main_module, "classify", lambda *_: (empty, empty, empty))
    else:
        original_transform = baseline.transform

        def duplicate_processed_rows(valid, customer_dim, product_dim):
            outputs = original_transform(valid, customer_dim, product_dim)
            processed = outputs["processed_transactions"]
            outputs["processed_transactions"] = processed.unionByName(processed)
            return outputs

        monkeypatch.setattr(main_module, "classify", classify)
        monkeypatch.setattr(baseline, "transform", duplicate_processed_rows)
    monkeypatch.setattr(main_module, "publish", lambda *args: published.append(args))

    with pytest.raises(RuntimeError, match="reconciliation failed"):
        main_module.run_pipeline(config, mode="baseline")

    assert published == []
    assert not (tmp_path / "outputs" / "runs" / batch).exists()
    reconciliation = json.loads((tmp_path / "reports" / f"{batch}_reconciliation.json").read_text())
    metrics = json.loads((tmp_path / "reports" / f"{batch}_metrics.json").read_text())
    assert reconciliation["status"] == "FAIL"
    assert metrics["pipeline_status"] == "FAILED"
    assert metrics["publication_state"] is None


def test_cleanup_pending_state_is_exposed_in_run_metrics(spark, monkeypatch, tmp_path):
    customers = spark.createDataFrame([customer()], CUSTOMER_SCHEMA)
    products = spark.createDataFrame([product()], PRODUCT_SCHEMA)
    transactions = spark.createDataFrame([transaction()], TRANSACTION_SCHEMA)

    class SparkStub:
        def stop(self):
            pass

    config = {
        "batch_id": "cleanup-pending",
        "input_dir": str(tmp_path / "input"),
        "output_dir": str(tmp_path / "outputs"),
        "reports_dir": str(tmp_path / "reports"),
    }
    monkeypatch.setattr(main_module, "spark_session", lambda _: SparkStub())
    monkeypatch.setattr(main_module, "read_inputs", lambda *_: (customers, products, transactions))
    monkeypatch.setattr(
        main_module, "publish",
        lambda _outputs, target: PublicationResult(
            state="CLEANUP_PENDING",
            target=target,
            backup_path=str(tmp_path / "old-backup"),
            cleanup_error="cleanup failed",
        ),
    )

    result = main_module.run_pipeline(config, mode="baseline")
    saved_metrics = json.loads(
        (tmp_path / "reports" / "cleanup-pending_metrics.json").read_text(encoding="utf-8")
    )

    assert result["pipeline_status"] == "SUCCESS"
    assert result["publication_state"] == "CLEANUP_PENDING"
    assert result["publication_backup_path"] == str(tmp_path / "old-backup")
    assert result["publication_cleanup_error"] == "cleanup failed"
    assert saved_metrics["publication_state"] == "CLEANUP_PENDING"
    assert saved_metrics["publication_cleanup_error"] == "cleanup failed"


def test_generate_cli_passes_explicit_zero_records(monkeypatch, capsys):
    captured = {}
    config = {
        "input_dir": "input",
        "dataset_size": 42,
        "random_seed": 1,
        "invalid_percent": 0.1,
        "logging_level": "INFO",
    }
    monkeypatch.setattr(main_module, "load_config", lambda: config)
    monkeypatch.setattr(main_module, "generate", lambda *args: captured.setdefault("args", args))
    monkeypatch.setattr(sys, "argv", ["retailflow", "generate", "--records", "0"])

    main_module.main()

    assert captured["args"][1] == 0
    assert capsys.readouterr().out


def test_benchmark_cli_passes_explicit_zero_records(monkeypatch, capsys):
    captured = {}
    config = {"dataset_size": 42, "logging_level": "INFO"}
    monkeypatch.setattr(main_module, "load_config", lambda: config)
    monkeypatch.setattr(
        benchmark_module,
        "benchmark",
        lambda cfg, records, repetitions: captured.update(records=records, repetitions=repetitions) or {},
    )
    monkeypatch.setattr(sys, "argv", ["retailflow", "benchmark", "--records", "0"])

    main_module.main()

    assert captured == {"records": 0, "repetitions": 3}
    assert capsys.readouterr().out
