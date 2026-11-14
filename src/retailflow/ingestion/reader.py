"""Explicit schema CSV readers with corrupt-record preservation."""
from pathlib import Path
import csv
from pyspark.sql import SparkSession, DataFrame
from pyspark.sql.functions import input_file_name
from retailflow.schemas import CUSTOMER_SCHEMA, PRODUCT_SCHEMA, TRANSACTION_SCHEMA

def read_inputs(spark: SparkSession, input_dir: str) -> tuple[DataFrame, DataFrame, DataFrame]:
    root = Path(input_dir)
    required = [root / "customers.csv", root / "products.csv", root / "transactions.csv"]
    missing = [str(p) for p in required if not p.is_file()]
    if missing: raise FileNotFoundError(f"Missing required inputs: {missing}")
    schemas = [CUSTOMER_SCHEMA, PRODUCT_SCHEMA, TRANSACTION_SCHEMA]
    for path, schema in zip(required, schemas):
        with path.open("r", newline="", encoding="utf-8-sig") as handle:
            header = next(csv.reader(handle), [])
        expected = [field.name for field in schema.fields if field.name != "_corrupt_record"]
        if header != expected:
            raise ValueError(f"Schema mismatch in {path}: expected {expected}, found {header}")
    def read(path, schema):
        return (spark.read.option("header", True).option("mode", "PERMISSIVE")
                .option("columnNameOfCorruptRecord", "_corrupt_record").schema(schema)
                .csv(str(path)).withColumn("_source_path", input_file_name()))
    return read(required[0], schemas[0]), read(required[1], schemas[1]), read(required[2], schemas[2])
