"""Deterministic synthetic retail CSV generation."""
import argparse, csv, random
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

def generate(output_dir: str, records: int, seed: int = 20261111, invalid_percent: float = .03,
             duplicate_events: bool = True) -> dict:
    if records < 0 or not 0 <= invalid_percent <= 1:
        raise ValueError("records must be nonnegative and invalid_percent in [0, 1]")
    rng = random.Random(seed); root = Path(output_dir); root.mkdir(parents=True, exist_ok=True)
    customers = [{"customer_id": f"C{i:06}", "customer_name": f"Customer {i}", "email": f"customer{i}@example.test", "city": ["Pune", "Delhi", "Kochi"][i % 3], "state": ["MH", "DL", "KL"][i % 3], "registration_date": f"2023-{i%12+1:02}-01", "created_at": "2023-01-01 00:00:00"} for i in range(1, 101)]
    products = [{"product_id": f"P{i:04}", "product_name": f"Product {i}", "category": ["Home", "Grocery", "Electronics"][i % 3], "unit_price": f"{Decimal(i*3+9):.2f}", "stock_quantity": 1000, "created_at": "2023-01-01 00:00:00"} for i in range(1, 31)]
    names = {"customers": list(customers[0]), "products": list(products[0]), "transactions": ["transaction_id", "customer_id", "product_id", "quantity", "transaction_timestamp", "ingestion_timestamp", "source_file", "run_id"]}
    for name, rows in (("customers", customers), ("products", products)):
        with (root / f"{name}.csv").open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=names[name]); writer.writeheader(); writer.writerows(rows)
    path = root / "transactions.csv"; txfields = names["transactions"]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=txfields); writer.writeheader()
        # Percentage applies to requested source transactions, rounded down.
        bad_count = int(records * invalid_percent)
        duplicate_index = bad_count if duplicate_events and bad_count < records else None
        valid_duplicate_pairs = 0
        for i in range(records):
            stamp = datetime(2024, 1, 1) + timedelta(minutes=i)
            row = {"transaction_id": f"T{i:09}", "customer_id": f"C{rng.randint(1,100):06}", "product_id": f"P{rng.randint(1,30):04}", "quantity": rng.randint(1, 8), "transaction_timestamp": stamp.strftime("%Y-%m-%d %H:%M:%S"), "ingestion_timestamp": (stamp+timedelta(minutes=2)).strftime("%Y-%m-%d %H:%M:%S"), "source_file": "transactions.csv", "run_id": "generated"}
            # Cycle through distinct failure classes while keeping labels out of input.
            if i < bad_count:
                kind = i % 6
                if kind == 0: row["customer_id"] = ""
                elif kind == 1: row["product_id"] = "UNKNOWN"
                elif kind == 2: row["quantity"] = -1
                elif kind == 3: row["quantity"] = 0
                elif kind == 4: row["transaction_id"] = ""
                else: row["customer_id"] = "C999999"
            writer.writerow(row)
            if i == duplicate_index:
                duplicate = dict(row)
                duplicate_time = stamp + timedelta(minutes=1)
                duplicate["transaction_timestamp"] = duplicate_time.strftime("%Y-%m-%d %H:%M:%S")
                duplicate["ingestion_timestamp"] = (duplicate_time + timedelta(minutes=2)).strftime("%Y-%m-%d %H:%M:%S")
                writer.writerow(duplicate)
                valid_duplicate_pairs += 1
            # Invalid rows are not additionally duplicated: this keeps the
            # corruption rate and row count independently interpretable.
    return {"customers": len(customers), "products": len(products), "transactions_requested": records,
            "invalid_transactions": bad_count,
            "valid_duplicate_pairs": valid_duplicate_pairs,
            "duplicate_events": valid_duplicate_pairs,
            "transaction_rows_written": records + valid_duplicate_pairs,
            "transaction_file": str(path)}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--output-dir", default="data/generated"); parser.add_argument("--records", type=int, default=10000); parser.add_argument("--seed", type=int, default=20261111); parser.add_argument("--invalid-percent", type=float, default=.03); parser.add_argument("--duplicate-events", action=argparse.BooleanOptionalAction, default=True)
    print(generate(**vars(parser.parse_args())))
