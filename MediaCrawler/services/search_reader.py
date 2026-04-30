import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import config


@dataclass(frozen=True)
class VideoCandidate:
    aweme_id: str
    aweme_url: str
    video_download_url: str
    liked_count: int
    source_keyword: str


def _base_data_dir() -> Path:
    return Path(config.SAVE_DATA_PATH) if config.SAVE_DATA_PATH else Path("data")


def _find_latest_search_contents_file() -> Path:
    base = _base_data_dir()
    folder = base / "douyin" / "jsonl"
    pattern = "search_contents_*.jsonl"
    candidates = list(folder.glob(pattern))
    if not candidates:
        raise FileNotFoundError(f"未找到数据文件：{folder}/{pattern}")

    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def _parse_candidate(obj: Dict[str, Any]) -> Optional[VideoCandidate]:
    aweme_id = str(obj.get("aweme_id") or "").strip()
    if not aweme_id:
        return None

    liked_raw = obj.get("liked_count")
    try:
        liked = int(liked_raw) if liked_raw is not None else 0
    except Exception:
        liked = 0

    return VideoCandidate(
        aweme_id=aweme_id,
        aweme_url=str(obj.get("aweme_url") or ""),
        video_download_url=str(obj.get("video_download_url") or ""),
        liked_count=liked,
        source_keyword=str(obj.get("source_keyword") or ""),
    )


def read_topn_search_results(*, limit: int) -> List[VideoCandidate]:
    if limit < 1:
        limit = 1
    if limit > 50:
        limit = 50

    items = read_search_results()
    items.sort(key=lambda x: x.liked_count, reverse=True)
    return items[:limit]


def read_search_results() -> List[VideoCandidate]:
    source_file = _find_latest_search_contents_file()
    lines = source_file.read_text(encoding="utf-8").splitlines()
    items: List[VideoCandidate] = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        try:
            obj = json.loads(ln)
        except Exception:
            continue
        if not isinstance(obj, dict):
            continue
        c = _parse_candidate(obj)
        if c:
            items.append(c)

    return items
