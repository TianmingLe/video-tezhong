import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import config
from services.platform_adapter import candidate_from_content, jsonl_dir


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
    folder = jsonl_dir(platform=str(config.PLATFORM or "dy"))
    pattern = "search_contents_*.jsonl"
    candidates = list(folder.glob(pattern))
    if not candidates:
        raise FileNotFoundError(f"未找到数据文件：{folder}/{pattern}")

    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def _parse_candidate(obj: Dict[str, Any]) -> Optional[VideoCandidate]:
    platform = str(config.PLATFORM or "dy")
    mapped = candidate_from_content(platform=platform, content=obj)
    if not mapped:
        return None

    return VideoCandidate(
        aweme_id=str(mapped.get("video_id") or ""),
        aweme_url=str(mapped.get("video_url") or ""),
        video_download_url=str(mapped.get("video_download_url") or ""),
        liked_count=int(mapped.get("rank") or 0),
        source_keyword=str(mapped.get("source_keyword") or ""),
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
