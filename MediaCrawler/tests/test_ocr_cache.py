import json
from pathlib import Path


def test_ocr_cache_hit(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    cache_dir = Path("data/douyin/ocr_cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "a.json").write_text(
        json.dumps(
            {
                "aweme_id": "a",
                "interval_sec": 5,
                "model": "ppocr_v4",
                "postprocess": {"ocr_text": "x", "ocr_summary": {"total_blocks": 0}},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    from services.ocr_service import load_ocr_cache

    got = load_ocr_cache(cache_dir=cache_dir, aweme_id="a", model="ppocr_v4", interval_sec=5)
    assert got is not None


def test_ocr_cache_miss_on_meta_change(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    cache_dir = Path("data/douyin/ocr_cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / "a.json").write_text(
        json.dumps(
            {
                "aweme_id": "a",
                "interval_sec": 5,
                "model": "ppocr_v4",
                "postprocess": {"ocr_text": "x", "ocr_summary": {"total_blocks": 0}},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    from services.ocr_service import load_ocr_cache

    got = load_ocr_cache(cache_dir=cache_dir, aweme_id="a", model="ppocr_v4", interval_sec=10)
    assert got is None

