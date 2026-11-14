"""Straightforward reference transformation implementation."""
from pyspark.sql import DataFrame
from pyspark.sql.functions import broadcast, col, to_date, month, year, sum as spark_sum, count, avg

def enrich(valid: DataFrame, customers: DataFrame, products: DataFrame,
           broadcast_dimensions: bool = False) -> DataFrame:
    customer_dim = broadcast(customers) if broadcast_dimensions else customers
    product_dim = broadcast(products) if broadcast_dimensions else products
    transaction = valid.alias("transaction")
    customer = customer_dim.alias("customer")
    product = product_dim.alias("product")

    selected = [col(f"transaction.`{name}`") for name in valid.columns]
    used_names = set(valid.columns)
    for name in customers.columns:
        if name == "customer_id":
            continue
        output_name = "customer_created_at" if name == "created_at" else name
        if output_name in used_names:
            output_name = f"customer_{name}"
        selected.append(col(f"customer.`{name}`").alias(output_name))
        used_names.add(output_name)
    for name in products.columns:
        if name == "product_id":
            continue
        output_name = "product_created_at" if name == "created_at" else name
        if output_name in used_names:
            output_name = f"product_{name}"
        selected.append(col(f"product.`{name}`").alias(output_name))
        used_names.add(output_name)

    return (transaction
            .join(customer, col("transaction.customer_id") == col("customer.customer_id"), "inner")
            .join(product, col("transaction.product_id") == col("product.product_id"), "inner")
            .select(*selected)
            .withColumn("total_amount", (col("quantity") * col("unit_price")).cast("decimal(18,2)"))
            .withColumn("transaction_date", to_date("transaction_timestamp"))
            .withColumn("transaction_month", month("transaction_timestamp"))
            .withColumn("transaction_year", year("transaction_timestamp")))

def transform(valid: DataFrame, customers: DataFrame, products: DataFrame) -> dict[str, DataFrame]:
    enriched = enrich(valid, customers, products)
    return aggregates(enriched)

def aggregates(enriched: DataFrame) -> dict[str, DataFrame]:
    return {"processed_transactions": enriched,
            "revenue_by_product": enriched.groupBy("product_id", "product_name").agg(spark_sum("total_amount").alias("revenue"), spark_sum("quantity").alias("units_sold")),
            "revenue_by_category": enriched.groupBy("category").agg(spark_sum("total_amount").alias("revenue"), spark_sum("quantity").alias("units_sold")),
            "revenue_by_customer": enriched.groupBy("customer_id", "customer_name").agg(spark_sum("total_amount").alias("revenue"), count("transaction_id").alias("orders")),
            "daily_sales": enriched.groupBy("transaction_date").agg(spark_sum("total_amount").alias("revenue"), count("transaction_id").alias("orders"), spark_sum("quantity").alias("units_sold")),
            "monthly_sales": enriched.groupBy("transaction_year", "transaction_month").agg(spark_sum("total_amount").alias("revenue"), count("transaction_id").alias("orders"), spark_sum("quantity").alias("units_sold"), avg("total_amount").alias("average_order_value")),
            "sales_summary": enriched.agg(spark_sum("total_amount").alias("total_revenue"), count("transaction_id").alias("total_orders"), spark_sum("quantity").alias("total_units_sold"), avg("total_amount").alias("average_order_value"))}
