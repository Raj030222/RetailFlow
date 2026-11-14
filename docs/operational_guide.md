# Operational guide

Generate deterministic inputs before a run. Use a stable batch ID to replace the corresponding output batch. Check the mode-specific metrics and reconciliation JSON after `run --mode both`; single-mode runs write these files directly into `reports/`. Failed reconciliation is recorded and prevents publication. Backfills should use a distinct batch ID and input snapshot.

## Publication backups

When a run replaces an existing batch, the old batch directory is retained as a hidden sibling named `.<batch-directory>.backup-<uuid>`. The successful publication metrics include the backup path in `publication_backup_path`. These backups are kept so the previous data remains available if an operator needs to roll back.

List backups for a target batch with Python:

```python
from pathlib import Path

target = Path("outputs/baseline/runs/my_batch")
backups = sorted(target.parent.glob(f".{target.name}.backup-*"))
print("\n".join(str(path) for path in backups))
```

There is no CLI command for cleanup or recovery. Use the Python functions with the actual target and backup paths:

```python
from retailflow.publishing.writer import cleanup_backup, recover_backup

target = "outputs/baseline/runs/my_batch"
backup = "outputs/baseline/runs/.my_batch.backup-<uuid>"
cleanup_result = cleanup_backup(target, backup)
print(cleanup_result.state, cleanup_result.backup_path, cleanup_result.cleanup_error)
```

`cleanup_backup(target, backup_path)` first copies the backup and verifies its files, then attempts to remove the original. It returns `PUBLISHED` with the verified retained backup path after successful cleanup. If copying, verification, or deletion fails, it returns `CLEANUP_PENDING`; its `backup_path` points to the available recovery copy. Inspect the returned state, error, and backup contents before attempting recovery.

To restore a retained backup:

```python
recovery_path = recover_backup(target, backup)
print("The former live target was preserved at:", recovery_path)
```

`recover_backup(target, backup_path)` moves the current target to a separate `.recovery-<uuid>` sibling before restoring the backup. It does not silently delete the currently published target. Recovery and publication are local filesystem operations and are not safe to run concurrently against the same batch.

Backups can consume substantial disk space, potentially close to the size of the batch. Cleanup temporarily requires room for a second verified copy; it retains that copy as the recovery backup even when cleanup succeeds. Keep sufficient free space and remove redundant backups only after confirming which batch is authoritative and preserving a recovery copy.

## Other operational considerations

Do not run two publishers against the same batch simultaneously. Preserve source CSVs and reports for audit. The directory swap is a single-writer local-filesystem best effort, not a transactional commit or a crash-safe multi-process protocol.
