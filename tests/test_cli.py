import csv
import json
import sys
from pathlib import Path

import pytest

from retailflow import main as main_module
from retailflow.generator.generate_data import generate


def _write_clean_input(input_dir):
    generate(str(input_dir), records=5, seed=18, invalid_percent=0)
    transaction_path = input_dir / "transactions.csv"
    with transaction_path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        fieldnames = reader.fieldnames
        rows = list(reader)
    seen = set()
    unique_rows = []
    for row in rows:
        if row["transaction_id"] not in seen:
            unique_rows.append(row)
            seen.add(row["transaction_id"])
    with transaction_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(unique_rows)


def _config(tmp_path, input_dir):
    return {
        "input_dir": str(input_dir),
        "output_dir": str(tmp_path / "outputs"),
        "reports_dir": str(tmp_path / "reports"),
        "dataset_size": 5,
        "random_seed": 18,
        "invalid_percent": 0.1,
        "spark_master": "local[1]",
        "spark_app_name": "RetailFlow-cli-tests",
        "shuffle_partitions": 1,
        "broadcast_threshold_bytes": 10485760,
        "batch_id": "cli-test",
        "logging_level": "INFO",
    }


def test_validate_cli_passes_clean_data_without_publishing(monkeypatch, capsys, tmp_path):
    input_dir = tmp_path / "clean-input"
    input_dir.mkdir()
    _write_clean_input(input_dir)
    monkeypatch.setattr(main_module, "load_config", lambda: _config(tmp_path, input_dir))
    monkeypatch.setattr(sys, "argv", ["retailflow", "validate"])

    main_module.main()

    result = json.loads(capsys.readouterr().out)
    assert result["status"] == "PASS"
    assert result["input_records"] == result["valid_records"]
    assert result["rejected_records"] == 0
    assert result["duplicate_records"] == 0
    assert result["malformed_records"] == 0
    assert result["rejection_reason_counts"] == {}
    assert not (tmp_path / "outputs").exists()
    assert not (tmp_path / "reports").exists()


@pytest.mark.parametrize("repetitions", ["0", "-2"])
def test_benchmark_cli_rejects_nonpositive_repetitions(
    monkeypatch, capsys, repetitions
):
    monkeypatch.setattr(
        sys, "argv", ["retailflow", "benchmark", "--repetitions", repetitions]
    )
    with pytest.raises(SystemExit) as error:
        main_module.main()
    assert error.value.code == 2
    assert "--repetitions must be at least 1" in capsys.readouterr().err


@pytest.mark.parametrize("input_kind", ["invalid", "missing"])
def test_validate_cli_returns_nonzero_for_invalid_or_missing_input(
    monkeypatch, capsys, tmp_path, input_kind
):
    input_dir = tmp_path / "input"
    if input_kind == "invalid":
        input_dir.mkdir()
        generate(str(input_dir), records=8, seed=3, invalid_percent=0.5)
    else:
        input_dir.mkdir()
    monkeypatch.setattr(main_module, "load_config", lambda: _config(tmp_path, input_dir))
    monkeypatch.setattr(sys, "argv", ["retailflow", "validate"])

    with pytest.raises(SystemExit) as error:
        main_module.main()

    expected_exit_code = 2 if input_kind == "missing" else 1
    assert error.value.code == expected_exit_code
    result = json.loads(capsys.readouterr().out)
    assert result["status"] == "FAIL"
    if input_kind == "invalid":
        assert result["rejection_reason_counts"] == {
            "missing_customer_id": 1,
            "invalid_product_reference": 1,
            "negative_quantity": 1,
            "zero_quantity": 1,
        }
    else:
        assert "rejection_reason_counts" not in result
    assert not (tmp_path / "outputs").exists()


def test_run_both_preserves_mode_specific_reports(monkeypatch, capsys, tmp_path):
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    generate(str(input_dir), records=4, seed=29, invalid_percent=0)
    config = _config(tmp_path, input_dir)
    monkeypatch.setattr(main_module, "load_config", lambda: config)
    monkeypatch.setattr(sys, "argv", ["retailflow", "run", "--mode", "both"])

    main_module.main()

    capsys.readouterr()
    for mode in ("baseline", "optimized"):
        report_dir = tmp_path / "reports" / mode
        metrics = json.loads((report_dir / "cli-test_metrics.json").read_text(encoding="utf-8"))
        reconciliation = json.loads(
            (report_dir / "cli-test_reconciliation.json").read_text(encoding="utf-8")
        )
        output_dir = tmp_path / "outputs" / mode / "runs" / "cli-test"
        assert metrics["mode"] == mode
        assert metrics["pipeline_status"] == "SUCCESS"
        assert reconciliation["mode"] == mode
        assert reconciliation["status"] == "PASS"
        assert (output_dir / "processed_transactions").is_dir()
