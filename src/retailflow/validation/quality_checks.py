"""Transaction validation and deterministic deduplication."""
from pyspark.sql import DataFrame, Window
from pyspark.sql.functions import col, when, concat_ws, lit, row_number, current_timestamp, count, sum as spark_sum, max as spark_max

def classify(transactions: DataFrame, customers: DataFrame, products: DataFrame):
    customer_records = customers.withColumn(
        "_dimension_malformed",
        col("_corrupt_record").isNotNull() if "_corrupt_record" in customers.columns else lit(False))
    customer_stats = (customer_records.groupBy("customer_id")
                      .agg(count(lit(1)).alias("_customer_record_count"),
                           spark_sum(when(col("_dimension_malformed"), 1).otherwise(0)).alias("_customer_malformed_count"))
                      .withColumnRenamed("customer_id", "_customer_key"))

    product_records = products.withColumn(
        "_dimension_malformed",
        col("_corrupt_record").isNotNull() if "_corrupt_record" in products.columns else lit(False))
    product_stats = (product_records.groupBy("product_id")
                     .agg(count(lit(1)).alias("_product_record_count"),
                          spark_sum(when(col("_dimension_malformed"), 1).otherwise(0)).alias("_product_malformed_count"),
                          spark_max(when(col("unit_price").isNull() | (col("unit_price") < 0), 1)
                                    .otherwise(0)).alias("_product_invalid_price"))
                     .withColumnRenamed("product_id", "_product_key"))

    joined = (transactions.join(customer_stats, transactions.customer_id == customer_stats._customer_key, "left")
              .join(product_stats, transactions.product_id == product_stats._product_key, "left")
              .drop("_customer_key", "_product_key"))
    transaction_malformed = (
        col("_corrupt_record").isNotNull() if "_corrupt_record" in transactions.columns else lit(False))
    reason = concat_ws(";", *[
        when(transaction_malformed, lit("malformed_csv_record")),
        when(col("transaction_id").isNull() | (col("transaction_id") == ""), lit("missing_transaction_id")),
        when(col("customer_id").isNull() | (col("customer_id") == ""), lit("missing_customer_id")),
        when(col("_customer_record_count").isNull() & col("customer_id").isNotNull(), lit("invalid_customer_reference")),
        when(col("_customer_record_count") > 1, lit("duplicate_customer_id")),
        when(col("_customer_malformed_count") > 0, lit("malformed_customer_record")),
        when(col("product_id").isNull() | (col("product_id") == ""), lit("missing_product_id")),
        when(col("_product_record_count").isNull() & col("product_id").isNotNull(), lit("invalid_product_reference")),
        when(col("_product_record_count") > 1, lit("duplicate_product_id")),
        when(col("_product_malformed_count") > 0, lit("malformed_product_record")),
        when(col("_product_invalid_price") > 0, lit("invalid_product_price")),
        when(col("quantity").isNull(), lit("missing_or_malformed_quantity")),
        when(col("quantity") < 0, lit("negative_quantity")),
        when(col("quantity") == 0, lit("zero_quantity")),
        when(col("transaction_timestamp").isNull(), lit("invalid_transaction_timestamp"))])
    marked = joined.withColumn("_reason", reason)
    # Invalid records are assigned before duplicate detection so one source row has one classification.
    internal_columns = [
        "_customer_record_count", "_customer_malformed_count", "_product_record_count",
        "_product_malformed_count", "_product_invalid_price", "_reason"]
    invalid = (marked.filter(col("_reason") != "")
               .withColumn("rejection_reason", col("_reason"))
               .withColumn("processed_at", current_timestamp())
               .drop(*internal_columns))
    candidates = marked.filter(col("_reason") == "")
    path_order = col("_source_path") if "_source_path" in transactions.columns else lit(None)
    tie_breakers = [
        col("transaction_timestamp").asc_nulls_last(),
        col("ingestion_timestamp").asc_nulls_last(),
        col("source_file").asc_nulls_last(),
        path_order.asc_nulls_last(),
        col("customer_id").asc_nulls_last(),
        col("product_id").asc_nulls_last(),
        col("quantity").asc_nulls_last(),
        col("run_id").asc_nulls_last(),
    ]
    if "_corrupt_record" in transactions.columns:
        tie_breakers.append(col("_corrupt_record").asc_nulls_last())
    w = Window.partitionBy("transaction_id").orderBy(*tie_breakers)
    ranked = candidates.withColumn("_rank", row_number().over(w))
    duplicates = (ranked.filter(col("_rank") > 1)
                  .withColumn("duplicate_reason", lit("duplicate_transaction_id"))
                  .drop(*internal_columns, "_rank"))
    valid = ranked.filter(col("_rank") == 1).drop(*internal_columns, "_rank")
    return valid, invalid, duplicates
