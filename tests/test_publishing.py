from pathlib import Path

import pytest

from retailflow.publishing import writer


def create_existing_batch(target):
    target.mkdir()
    (target / "part-00000.parquet").write_bytes(b"old parquet data")


def test_publish_success_retains_previous_batch_as_backup(tmp_path):
    target = tmp_path / "batch"
    create_existing_batch(target)

    result = writer.publish({}, str(target))

    assert result.state == "PUBLISHED"
    assert result.target == str(target)
    assert result.backup_path is not None
    assert Path(result.backup_path, "part-00000.parquet").read_bytes() == b"old parquet data"
    assert target.is_dir()


def test_stage_swap_failure_restores_previous_target(tmp_path, monkeypatch):
    target = tmp_path / "batch"
    create_existing_batch(target)
    original_rename = Path.rename

    def fail_stage_swap(path, destination):
        if ".staging-" in path.name and Path(destination) == target:
            raise OSError("injected stage swap failure")
        return original_rename(path, destination)

    monkeypatch.setattr(Path, "rename", fail_stage_swap)

    with pytest.raises(writer.PublicationError, match="injected stage swap failure") as error:
        writer.publish({}, str(target))

    assert error.value.publication_state == "FAILED"
    assert error.value.backup_path is None
    assert (target / "part-00000.parquet").read_bytes() == b"old parquet data"
    assert not list(tmp_path.glob(".batch.staging-*"))
    assert not list(tmp_path.glob(".batch.backup-*"))


def test_cleanup_failure_before_deletion_preserves_verified_backup(tmp_path, monkeypatch):
    target = tmp_path / "batch"
    create_existing_batch(target)
    publication = writer.publish({}, str(target))
    backup = Path(publication.backup_path)
    real_rmtree = writer.shutil.rmtree

    def fail_before_delete(path, *args, **kwargs):
        if Path(path) == backup:
            raise OSError("injected cleanup failure")
        return real_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(writer.shutil, "rmtree", fail_before_delete)
    result = writer.cleanup_backup(str(target), str(backup))

    assert result.state == "CLEANUP_PENDING"
    assert result.cleanup_error == "injected cleanup failure"
    assert Path(result.backup_path, "part-00000.parquet").read_bytes() == b"old parquet data"


def test_partial_cleanup_failure_keeps_verified_backup_contents(tmp_path, monkeypatch):
    target = tmp_path / "batch"
    create_existing_batch(target)
    (target / "part-00001.parquet").write_bytes(b"another old parquet file")
    publication = writer.publish({}, str(target))
    backup = Path(publication.backup_path)
    real_rmtree = writer.shutil.rmtree

    def partially_delete_then_fail(path, *args, **kwargs):
        if Path(path) == backup:
            (backup / "part-00000.parquet").unlink()
            raise OSError("injected partial recursive-delete failure")
        return real_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(writer.shutil, "rmtree", partially_delete_then_fail)
    result = writer.cleanup_backup(str(target), str(backup))

    retained = Path(result.backup_path)
    assert result.state == "CLEANUP_PENDING"
    assert result.cleanup_error == "injected partial recursive-delete failure"
    assert (retained / "part-00000.parquet").read_bytes() == b"old parquet data"
    assert (retained / "part-00001.parquet").read_bytes() == b"another old parquet file"
    assert not (backup / "part-00000.parquet").exists()


def test_recovery_restores_backup_and_preserves_live_target(tmp_path):
    target = tmp_path / "batch"
    create_existing_batch(target)
    publication = writer.publish({}, str(target))
    (target / "new-output.parquet").write_bytes(b"new published data")

    displaced_path = writer.recover_backup(str(target), publication.backup_path)

    assert (target / "part-00000.parquet").read_bytes() == b"old parquet data"
    assert displaced_path is not None
    assert Path(displaced_path, "new-output.parquet").read_bytes() == b"new published data"
