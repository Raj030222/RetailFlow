# Curated Parquet outputs

These are small representative Parquet datasets copied from actual Phase 2L baseline and optimized executions, not hand-created fixtures.

- `phase2l_20261114/baseline/` is batch `phase2l_20261114_base`, job `d88a8edefe744b68affa94ec98f9288b`.
- `phase2l_20261114/optimized/` is batch `phase2l_20261114_opt`, job `9a85d65767f5468393a33c638935bb56`.

Each contains all nine output datasets, including `processed_transactions`, `rejected_records`, and `duplicate_records`. Both runs reconciled 1,001 input rows into 970 valid, 30 rejected, and one duplicate. Schemas and data matched after excluding run-specific metadata. See the corresponding metrics and reconciliation JSON files in `reports/`.
