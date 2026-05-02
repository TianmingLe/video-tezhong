from services.processed_registry import ProcessedRegistry


def test_registry_records_and_skips(tmp_path):
    p = tmp_path / "processed.jsonl"
    reg = ProcessedRegistry(path=p)
    assert reg.is_processed("1") is False
    reg.append_success("1")
    assert reg.is_processed("1") is True

