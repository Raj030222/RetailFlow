import csv
import json
from pathlib import Path

import pytest

from retailflow.benchmarking import benchmark as benchmark_module
from retailflow.transformations import baseline, optimized


class FakeFrame:
    def __init__(self, value):
        self.value = value
        self._jdf = self

    def count(self):
        return self.value

    def exceptAll(self, _other):
        return FakeFrame(0)

    def limit(self, _count):
        return self

    def queryExecution(self):
        return self

    def executedPlan(self):
        return self

    def toString(self):
        return "fake physical plan"


class FakeSpark:
    def stop(self):
        pass


class MismatchFrame(FakeFrame):
    def exceptAll(self, _other):
        return FakeFrame(1)


class TrackedFrame(FakeFrame):
    def __init__(self, name, value, events):
        super().__init__(value)
        self.name = name
        self.events = events
        self.persisted = False

    def persist(self, _storage_level):
        self.events.append(("persist", self.name))
        self.persisted = True
        return self

    def unpersist(self, blocking=False):
        self.events.append(("unpersist", self.name, blocking))
        self.persisted = False
        return self

    def count(self):
        self.events.append(("count", self.name))
        return self.value

    def exceptAll(self, _other):
        self.events.append(("exceptAll", self.name))
        return TrackedFrame(f"{self.name}_difference", 0, self.events)

    def limit(self, _count):
        return self


def _benchmark_config(tmp_path, monkeypatch, events, inputs, valid):
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    config = {
        "input_dir": str(input_dir),
        "reports_dir": str(tmp_path / "reports"),
        "random_seed": 13,
        "invalid_percent": 0.1,
    }
    monkeypatch.setattr(
        "retailflow.generator.generate_data.generate",
        lambda *_args: {"transactions_requested": 10},
    )
    monkeypatch.setattr(benchmark_module, "spark_session", lambda _cfg: FakeSpark())
    monkeypatch.setattr(benchmark_module, "read_inputs", lambda *_args: inputs)
    monkeypatch.setattr(benchmark_module, "classify", lambda *_args: (valid, None, None))
    return config


def test_benchmark_writes_consistent_json_and_csv_reports(tmp_path, monkeypatch):
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    reports_dir = tmp_path / "reports"
    config = {
        "input_dir": str(input_dir),
        "reports_dir": str(reports_dir),
        "random_seed": 13,
        "invalid_percent": 0.1,
    }
    outputs = {
        "processed_transactions": FakeFrame(8),
        "sales_summary": FakeFrame(1),
    }
    monkeypatch.setattr(
        "retailflow.generator.generate_data.generate",
        lambda *_args: {"transactions_requested": 10},
    )
    monkeypatch.setattr(benchmark_module, "spark_session", lambda _cfg: FakeSpark())
    monkeypatch.setattr(benchmark_module, "read_inputs", lambda *_args: ("customers", "products", "transactions"))
    monkeypatch.setattr(benchmark_module, "classify", lambda *_args: ("valid", None, None))
    monkeypatch.setattr(baseline, "transform", lambda *_args: outputs)
    monkeypatch.setattr(optimized, "transform", lambda *_args: outputs)

    result = benchmark_module.benchmark(config, records=10, repetitions=1)

    json_path = reports_dir / "benchmark_results.json"
    csv_path = reports_dir / "benchmark_results.csv"
    assert json_path.is_file()
    assert csv_path.is_file()
    assert (reports_dir / "performance_report.md").is_file()
    saved = json.loads(json_path.read_text(encoding="utf-8"))
    with csv_path.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))

    assert saved == result
    assert [row["implementation"] for row in rows] == ["baseline", "optimized"]
    for row in rows:
        implementation = row["implementation"]
        assert json.loads(row["output_counts"]) == saved[implementation]["output_counts"]
        assert row["output_records"] == str(saved[implementation]["output_records"])
        assert row["plan"] == saved[implementation]["plan"]
        assert row["equivalent"] == "True"
        assert row["improvement_percent"] == ""
        assert row["performance_assessment"] == "insufficient_repetitions"
        assert row["records"] == "10"
        assert row["repetitions"] == "1"
    assert saved["equivalent"] is True
    assert saved["improvement_percent"] is None
    assert saved["performance_assessment"] == "insufficient_repetitions"
    markdown = (reports_dir / "performance_report.md").read_text(encoding="utf-8")
    assert "Equivalent outputs: True." in markdown
    assert "Observed change: not assessed (insufficient repetitions)." in markdown


def test_benchmark_persistence_lifecycle_covers_repetitions_and_reconciliation(
    tmp_path, monkeypatch
):
    events = []
    customers, products, transactions = (
        TrackedFrame(name, 1, events)
        for name in ("customers", "products", "transactions")
    )
    valid = TrackedFrame("valid", 4, events)
    config = _benchmark_config(
        tmp_path, monkeypatch, events, (customers, products, transactions), valid
    )
    outputs_by_mode = {
        name: {
            "processed_transactions": TrackedFrame(f"{name}_processed", 4, events),
            "sales_summary": TrackedFrame(f"{name}_summary", 1, events),
        }
        for name in ("baseline", "optimized")
    }
    calls = {"baseline": 0, "optimized": 0}

    def transform(name):
        def run(*_args):
            assert customers.persisted and products.persisted and valid.persisted
            assert all(
                any(event[:2] == ("count", frame.name) for event in events)
                for frame in (customers, products, valid)
            )
            calls[name] += 1
            events.append(("transform", name, calls[name]))
            return outputs_by_mode[name]

        return run

    monkeypatch.setattr(baseline, "transform", transform("baseline"))
    monkeypatch.setattr(optimized, "transform", transform("optimized"))

    result = benchmark_module.benchmark(config, records=10, repetitions=2)

    assert calls == {"baseline": 2, "optimized": 2}
    assert len([event for event in events if event[0] == "exceptAll"]) == 4
    transforms = [i for i, event in enumerate(events) if event[0] == "transform"]
    materialized = [i for i, event in enumerate(events) if event[0] == "count"]
    assert max(i for i in materialized if events[i][1] in {"customers", "products", "valid"}) < min(transforms)
    assert result["equivalent"] is True
    assert not any(frame.persisted for frame in (customers, products, valid))
    assert [event[1] for event in events if event[0] == "unpersist"] == [
        "valid",
        "products",
        "customers",
    ]


def test_benchmark_withholds_improvement_when_outputs_are_not_equivalent(
    tmp_path, monkeypatch
):
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    config = {
        "input_dir": str(input_dir), "reports_dir": str(tmp_path / "reports"),
        "random_seed": 13, "invalid_percent": 0.1,
    }
    outputs = {
        "processed_transactions": MismatchFrame(8),
        "sales_summary": MismatchFrame(1),
    }
    monkeypatch.setattr("retailflow.generator.generate_data.generate", lambda *_args: None)
    monkeypatch.setattr(benchmark_module, "spark_session", lambda _cfg: FakeSpark())
    monkeypatch.setattr(benchmark_module, "read_inputs", lambda *_args: ("c", "p", "t"))
    monkeypatch.setattr(benchmark_module, "classify", lambda *_args: ("valid", None, None))
    monkeypatch.setattr(baseline, "transform", lambda *_args: outputs)
    monkeypatch.setattr(optimized, "transform", lambda *_args: outputs)

    result = benchmark_module.benchmark(config, records=10, repetitions=2)

    assert result["equivalent"] is False
    assert result["improvement_percent"] is None
    assert result["baseline"]["median_seconds"] >= 0
    assert result["optimized"]["median_seconds"] >= 0
    report = (tmp_path / "reports" / "performance_report.md").read_text()
    assert "comparison invalid" in report
    assert "improvement, speedup, and time-saved claims are withheld" in report
    assert "Baseline median:" in report and "Optimized median:" in report


def test_markdown_withholds_comparison_when_equivalence_is_unavailable(tmp_path):
    results = {
        "baseline": {
            "median_seconds": 2.5, "output_records": 10,
            "output_counts": {}, "plan": "baseline plan",
        },
        "optimized": {
            "median_seconds": 1.5, "output_records": 10,
            "output_counts": {}, "plan": "optimized plan",
        },
        "equivalent": None,
        "records": 10,
        "repetitions": 3,
        "improvement_percent": None,
        "performance_assessment": "observed_only",
        "performance_note": "Diagnostic note.",
    }

    benchmark_module._write_success_artifacts(tmp_path, results)

    report = (tmp_path / "performance_report.md").read_text(encoding="utf-8")
    assert "Equivalent outputs: None" not in report
    assert "cannot be made because output equivalence could not be established" in report
    assert "Baseline median: 2.5000s" in report
    assert "Optimized median: 1.5000s" in report


def test_benchmark_unpersists_partially_materialized_inputs(tmp_path, monkeypatch):
    events = []
    customers, products, transactions = (
        TrackedFrame(name, 1, events)
        for name in ("customers", "products", "transactions")
    )
    valid = TrackedFrame("valid", 4, events)
    config = _benchmark_config(
        tmp_path, monkeypatch, events, (customers, products, transactions), valid
    )

    def fail_customer_count():
        events.append(("count_failed", "customers"))
        raise OSError("materialization failed")

    monkeypatch.setattr(customers, "count", fail_customer_count)
    with pytest.raises(RuntimeError, match="materialization failed"):
        benchmark_module.benchmark(config, 10, 1)
    assert not customers.persisted
    assert not products.persisted
    assert [event[1] for event in events if event[0] == "unpersist"] == ["customers"]


def test_benchmark_unpersists_shared_frames_when_transformation_raises(
    tmp_path, monkeypatch
):
    events = []
    customers, products, transactions = (
        TrackedFrame(name, 1, events)
        for name in ("customers", "products", "transactions")
    )
    valid = TrackedFrame("valid", 4, events)
    config = _benchmark_config(
        tmp_path, monkeypatch, events, (customers, products, transactions), valid
    )
    monkeypatch.setattr(baseline, "transform", lambda *_args: {
        "processed_transactions": TrackedFrame("baseline_processed", 4, events),
        "sales_summary": TrackedFrame("baseline_summary", 1, events),
    })

    def fail_optimized(*_args):
        raise OSError("simulated transformation failure")

    monkeypatch.setattr(optimized, "transform", fail_optimized)

    with pytest.raises(RuntimeError, match="simulated transformation failure"):
        benchmark_module.benchmark(config, records=10, repetitions=1)

    assert not any(frame.persisted for frame in (customers, products, valid))
    assert [event[1] for event in events if event[0] == "unpersist"] == [
        "valid",
        "products",
        "customers",
    ]
    failure_report = json.loads(
        (tmp_path / "reports" / "benchmark_failure.json").read_text(encoding="utf-8")
    )
    assert failure_report["failure"]["stage"] == "transformation_and_count"
    assert failure_report["failure"]["implementation"] == "optimized"


@pytest.mark.parametrize("repetitions", [0, -1])
def test_benchmark_rejects_nonpositive_repetitions_before_setup(
    tmp_path, monkeypatch, repetitions
):
    monkeypatch.setattr(
        "retailflow.generator.generate_data.generate",
        lambda *_args: pytest.fail("dataset generation must not run"),
    )
    with pytest.raises(ValueError, match="at least 1"):
        benchmark_module.benchmark({"input_dir": str(tmp_path)}, 10, repetitions)


@pytest.mark.parametrize(
    ("failing_stage", "expected_stage"),
    [("generation", "dataset_generation"), ("spark", "spark_session_startup")],
)
def test_benchmark_captures_generation_and_spark_startup_failures(
    tmp_path, monkeypatch, failing_stage, expected_stage
):
    events = []
    config = {
        "input_dir": str(tmp_path / "input"),
        "reports_dir": str(tmp_path / "reports"),
        "random_seed": 2,
        "invalid_percent": 0.1,
    }
    if failing_stage == "generation":
        monkeypatch.setattr(
            "retailflow.generator.generate_data.generate",
            lambda *_args: (_ for _ in ()).throw(OSError("generate failed")),
        )
    else:
        monkeypatch.setattr(
            "retailflow.generator.generate_data.generate", lambda *_args: None
        )
        monkeypatch.setattr(
            benchmark_module, "spark_session",
            lambda _cfg: (_ for _ in ()).throw(OSError("spark failed")),
        )
    with pytest.raises(RuntimeError, match="failed"):
        benchmark_module.benchmark(config, 10, 1)
    failure = json.loads((tmp_path / "reports" / "benchmark_failure.json").read_text())
    assert failure["failure"]["stage"] == expected_stage
    assert "failed" in failure["failure"]["root_error"]


def test_benchmark_cleanup_failure_does_not_hide_execution_failure(tmp_path, monkeypatch):
    events = []
    customers, products, transactions = (
        TrackedFrame(name, 1, events)
        for name in ("customers", "products", "transactions")
    )
    valid = TrackedFrame("valid", 4, events)
    config = _benchmark_config(
        tmp_path, monkeypatch, events, (customers, products, transactions), valid
    )
    monkeypatch.setattr(baseline, "transform", lambda *_args: (_ for _ in ()).throw(ValueError("original transform error")))

    def fail_unpersist(*_args, **_kwargs):
        raise OSError("cleanup error")

    monkeypatch.setattr(valid, "unpersist", fail_unpersist)
    with pytest.raises(RuntimeError, match="original transform error"):
        benchmark_module.benchmark(config, 10, 1)
    assert json.loads((tmp_path / "reports" / "benchmark_failure.json").read_text())["failure"]["stage"] == "transformation_and_count"


def test_failed_report_publication_restores_previous_artifact_set(tmp_path, monkeypatch):
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    reports_dir = tmp_path / "reports"
    config = {
        "input_dir": str(input_dir), "reports_dir": str(reports_dir),
        "random_seed": 13, "invalid_percent": 0.1,
    }
    outputs = {"processed_transactions": FakeFrame(8), "sales_summary": FakeFrame(1)}
    monkeypatch.setattr("retailflow.generator.generate_data.generate", lambda *_args: None)
    monkeypatch.setattr(benchmark_module, "spark_session", lambda _cfg: FakeSpark())
    monkeypatch.setattr(benchmark_module, "read_inputs", lambda *_args: ("c", "p", "t"))
    monkeypatch.setattr(benchmark_module, "classify", lambda *_args: ("valid", None, None))
    monkeypatch.setattr(baseline, "transform", lambda *_args: outputs)
    monkeypatch.setattr(optimized, "transform", lambda *_args: outputs)
    benchmark_module.benchmark(config, 10, 1)
    names = ("benchmark_results.json", "benchmark_results.csv", "performance_report.md")
    original = {name: (reports_dir / name).read_bytes() for name in names}

    real_replace = benchmark_module.os.replace
    failed = {"done": False}

    def fail_csv_once(source, destination):
        if Path(destination).name == "benchmark_results.csv" and not failed["done"] and Path(source).parent.name == "staged":
            failed["done"] = True
            raise OSError("simulated publication failure")
        return real_replace(source, destination)

    monkeypatch.setattr(benchmark_module.os, "replace", fail_csv_once)
    with pytest.raises(RuntimeError, match="report_publication"):
        benchmark_module.benchmark(config, 11, 1)
    assert {name: (reports_dir / name).read_bytes() for name in names} == original
    failure = json.loads((reports_dir / "benchmark_failure.json").read_text())
    assert failure["failure"]["stage"] == "report_publication"
