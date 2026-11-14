"""Batch directory publication with staging, rollback, and recoverable backups."""
import logging
import shutil
import uuid
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Literal

from pyspark.sql import DataFrame

PublicationState = Literal["STAGING", "PUBLISHED", "CLEANUP_PENDING", "FAILED"]
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PublicationResult:
    state: PublicationState
    target: str
    backup_path: str | None = None
    cleanup_error: str | None = None


class PublicationError(RuntimeError):
    """Publication failed before the new target became live."""

    def __init__(self, message: str, *, backup_path: str | None = None):
        super().__init__(message)
        self.publication_state: PublicationState = "FAILED"
        self.backup_path = backup_path


def publish(outputs: dict[str, DataFrame], target: str) -> PublicationResult:
    root = Path(target)
    stage = root.parent / f".{root.name}.staging-{uuid.uuid4().hex}"
    backup = root.parent / f".{root.name}.backup-{uuid.uuid4().hex}"
    logger.info("Publication state=STAGING target=%s", root)

    try:
        root.parent.mkdir(parents=True, exist_ok=True)
        stage.mkdir()
        for name, frame in outputs.items():
            frame.write.mode("overwrite").parquet(str(stage / name))
    except Exception as exc:
        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)
        raise PublicationError(f"Failed while staging publication for {root}: {exc}") from exc

    backup_created = False
    if root.exists():
        try:
            root.rename(backup)
            backup_created = True
        except Exception as exc:
            if stage.exists():
                shutil.rmtree(stage, ignore_errors=True)
            raise PublicationError(f"Failed to move existing target {root} to backup: {exc}") from exc

    try:
        stage.rename(root)
    except Exception as exc:
        rollback_error = None
        if backup_created:
            try:
                backup.rename(root)
            except Exception as rollback_exc:
                rollback_error = rollback_exc
        message = f"Failed to publish staged output to {root}: {exc}"
        if rollback_error is not None:
            message += f"; rollback also failed: {rollback_error}"
        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)
        raise PublicationError(
            message,
            backup_path=str(backup) if backup_created and backup.exists() else None,
        ) from exc

    logger.info("Publication state=PUBLISHED target=%s", root)
    return PublicationResult(
        state="PUBLISHED",
        target=str(root),
        backup_path=str(backup) if backup_created else None,
    )


def _directory_manifest(root: Path) -> dict[str, tuple[str, ...]]:
    manifest = {}
    for path in sorted(root.rglob("*")):
        relative = str(path.relative_to(root))
        if path.is_symlink():
            manifest[relative] = ("symlink", str(path.readlink()))
        elif path.is_dir():
            manifest[relative] = ("directory",)
        else:
            digest = sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            manifest[relative] = ("file", str(path.stat().st_size), digest.hexdigest())
    return manifest


def cleanup_backup(target: str, backup_path: str) -> PublicationResult:
    """Remove a backup only after verifying a second intact recovery copy."""
    root = Path(target)
    backup = Path(backup_path)
    if backup.parent != root.parent or not backup.name.startswith(f".{root.name}.backup-"):
        raise ValueError(f"{backup} is not a backup for target {root}")
    if not backup.is_dir():
        raise FileNotFoundError(f"Publication backup does not exist: {backup}")

    recovery = root.parent / f".{root.name}.backup-{uuid.uuid4().hex}"
    staging_copy = root.parent / f".{root.name}.backup-staging-{uuid.uuid4().hex}"
    try:
        shutil.copytree(backup, staging_copy, symlinks=True)
        if _directory_manifest(backup) != _directory_manifest(staging_copy):
            raise OSError(f"Backup verification failed while copying {backup}")
        staging_copy.rename(recovery)
    except Exception as exc:
        if staging_copy.exists():
            shutil.rmtree(staging_copy, ignore_errors=True)
        logger.exception("Publication state=CLEANUP_PENDING target=%s backup=%s", root, backup)
        return PublicationResult(
            state="CLEANUP_PENDING",
            target=str(root),
            backup_path=str(backup),
            cleanup_error=str(exc),
        )

    try:
        shutil.rmtree(backup)
    except Exception as exc:
        logger.exception("Publication state=CLEANUP_PENDING target=%s backup=%s", root, recovery)
        return PublicationResult(
            state="CLEANUP_PENDING",
            target=str(root),
            backup_path=str(recovery),
            cleanup_error=str(exc),
        )

    logger.info("Publication state=PUBLISHED target=%s retained_backup=%s", root, recovery)
    return PublicationResult(state="PUBLISHED", target=str(root), backup_path=str(recovery))


def recover_backup(target: str, backup_path: str) -> str | None:
    """Restore a retained publication backup, preserving any current target."""
    root = Path(target)
    backup = Path(backup_path)
    if backup.parent != root.parent or not backup.name.startswith(f".{root.name}.backup-"):
        raise ValueError(f"{backup} is not a backup for target {root}")
    if not backup.is_dir():
        raise FileNotFoundError(f"Publication backup does not exist: {backup}")

    displaced = None
    if root.exists():
        displaced = root.parent / f".{root.name}.recovery-{uuid.uuid4().hex}"
        root.rename(displaced)
    try:
        backup.rename(root)
    except Exception:
        if displaced is not None and displaced.exists() and not root.exists():
            displaced.rename(root)
        raise
    return str(displaced) if displaced is not None else None


def write_frame(frame: DataFrame, path: str) -> None:
    frame.write.mode("overwrite").parquet(path)
