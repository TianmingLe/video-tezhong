import json
from pathlib import Path

import config


def test_read_search_results_xhs_and_sort_key(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    config.PLATFORM = "xhs"

    p = Path("data/xhs/jsonl")
    p.mkdir(parents=True, exist_ok=True)
    f = p / "search_contents_2099-01-01.jsonl"
    f.write_text(
        json.dumps({"note_id": "n1", "note_url": "https://www.xiaohongshu.com/explore/n1?xsec_token=1", "video_url": "http://v", "liked_count": 1, "collected_count": 2, "comment_count": 3}, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )

    from services.search_reader import read_search_results

    items = read_search_results()
    assert len(items) == 1
    assert items[0].aweme_id == "n1"
    assert items[0].liked_count == 6


def test_read_search_results_bili_pubdate_rank(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    config.PLATFORM = "bili"

    p = Path("data/bili/jsonl")
    p.mkdir(parents=True, exist_ok=True)
    f = p / "search_contents_2099-01-01.jsonl"
    f.write_text(
        json.dumps({"video_id": "av1", "video_url": "https://www.bilibili.com/video/av1", "create_time": 1710000000}, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )

    from services.search_reader import read_search_results

    items = read_search_results()
    assert len(items) == 1
    assert items[0].aweme_id == "av1"
    assert items[0].liked_count == 1710000000

