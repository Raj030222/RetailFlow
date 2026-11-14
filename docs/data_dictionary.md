 Data dictionary

| Entity | Grain and key | Fields |
|---|---|---|
| Customers | One row per customer; `customer_id` unique | `customer_name`, `email`, `city`, `state`, `registration_date`, `created_at` describe the customer. IDs are non-null for valid dimension rows. |
| Products | One row per product; `product_id` unique | `product_name`, `category`, `unit_price` (decimal), `stock_quantity`, `created_at`. Price must be nonnegative; product IDs are unique. |
| Transactions | One source event; `transaction_id` is event key | `customer_id` and `product_id` reference dimensions; `quantity` must be positive; timestamps describe event/arrival; `source_file` and `run_id` trace provenance. |

The curated grain is one winning transaction event. Winner order is earliest transaction timestamp, then earliest ingestion timestamp, source-file field, Spark input path, customer ID, product ID, quantity, and run ID. Invalid events and duplicate valid events remain separate outputs. Output `total_amount` is quantity times unit price, rounded through decimal arithmetic. Zero and negative quantities are rejected. The generator produces a deterministic valid duplicate pair when at least one requested transaction can be valid; the earlier transaction timestamp wins.
