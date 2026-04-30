import json
from pathlib import Path


def test_search_reader_topn(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    p = Path("data/douyin/jsonl")
    p.mkdir(parents=True, exist_ok=True)
    f = p / "search_contents_2099-01-01.jsonl"
    f.write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "aweme_id": "1",
                        "liked_count": "2",
                        "aweme_url": "u1",
                        "video_download_url": "d1",
                        "source_keyword": "k",
                    },
                    ensure_ascii=False,
                ),
                json.dumps(
                    {
                        "aweme_id": "2",
                        "liked_count": "10",
                        "aweme_url": "u2",
                        "video_download_url": "d2",
                        "source_keyword": "k",
                    },
                    ensure_ascii=False,
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    from services.search_reader import read_topn_search_results

    top = read_topn_search_results(limit=1)
    assert top[0].aweme_id == "2"

