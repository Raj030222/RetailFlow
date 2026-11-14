"""Optimized variant: broadcast small dimensions and reuse aggregate logic."""
from pyspark.sql import DataFrame
from retailflow.transformations.baseline import aggregates, enrich

def transform(valid: DataFrame, customers: DataFrame, products: DataFrame) -> dict[str, DataFrame]:
    enriched = enrich(valid, customers, products, broadcast_dimensions=True)
    return aggregates(enriched)
