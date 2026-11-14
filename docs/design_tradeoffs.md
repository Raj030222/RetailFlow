# Design tradeoffs

- PySpark provides distributed DataFrame execution and explainable physical plans while still running locally.
- Parquet is compact, typed, and columnar for analytics.
- The optimized path explicitly broadcasts customer and product dimensions. This fits the small generated dimensions; larger inputs can exceed executor memory because the hints bypass Spark's normal automatic size decision. Measure dimension sizes and executor capacity before using this path at larger scale.
- Date fields are retained in analytical results; the compact default does not partition tiny datasets because that would create small files. Larger deployments can partition daily/monthly outputs by date.
- `shuffle_partitions` configures `spark.sql.shuffle.partitions`. Aggregations still shuffle by grouping key; the pipeline does not implement explicit output partitioning, adaptive partition sizing, or a separate shuffle-reduction strategy.
- Reruns replace an entire batch folder from a staged sibling directory. This is safe for a single local writer but is not a transactional commit or concurrent-writer protocol.
- Delta Lake or another transactional table format adds atomic commits and versioned recovery. Benchmark timing on a single Windows machine is only indicative; warmup, cache, and load affect outcomes.
