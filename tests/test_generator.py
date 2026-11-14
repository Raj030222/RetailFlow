import csv
from retailflow.generator.generate_data import generate
from pathlib import Path

def test_generation_counts(tmp_path):
    result=generate(str(tmp_path), 25, 4, .2)
    assert result["transactions_requested"] == 25
    assert Path(result["transaction_file"]).exists()

def test_requested_count_is_transactions_and_duplicate_is_additional(tmp_path):
    result = generate(str(tmp_path), 10_000, 20261111, .03, True)
    with (tmp_path / "transactions.csv").open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert result["customers"] == 100
    assert result["products"] == 30
    assert result["transactions_requested"] == 10_000
    assert result["invalid_transactions"] == 300
    assert result["duplicate_events"] == 1
    assert len(rows) == result["transaction_rows_written"] == 10_001
    assert len(rows) == 10_000 + 1

def test_clean_generation_has_exact_rows_and_no_injected_duplicates(tmp_path):
    result = generate(str(tmp_path), 10_000, 20261111, 0, False)
    with (tmp_path / "transactions.csv").open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert result["invalid_transactions"] == result["duplicate_events"] == 0
    assert len(rows) == result["transaction_rows_written"] == 10_000
    assert len({row["transaction_id"] for row in rows}) == 10_000

def test_generation_is_reproducible(tmp_path):
    left=tmp_path / "left"; right=tmp_path / "right"
    generate(str(left), 20, 91, .1); generate(str(right), 20, 91, .1)
    for name in ("customers.csv", "products.csv", "transactions.csv"):
        assert (left/name).read_bytes() == (right/name).read_bytes()

def test_zero_record_generation_writes_empty_transaction_file(tmp_path):
    result = generate(str(tmp_path), 0, 4, .2)

    assert result["transactions_requested"] == 0
    with (tmp_path / "transactions.csv").open(newline="", encoding="utf-8") as handle:
        assert list(csv.reader(handle)) == [[
            "transaction_id", "customer_id", "product_id", "quantity",
            "transaction_timestamp", "ingestion_timestamp", "source_file", "run_id",
        ]]
