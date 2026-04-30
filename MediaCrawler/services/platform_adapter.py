import re
from pathlib import Path
from typing import Any, Dict, Optional

import config


SUPPORTED_PLATFORMS = ("dy", "xhs", "bili")


def parse_video_id(*, platform: str, url_or_id: str) -> str:
    s = str(url_or_id or "").strip()
    if not s:
        return ""

    if platform == "dy":
        m = re.search(r"(\d{8,})", s)
        return m.group(1) if m else ""

    if platform == "xhs":
        m = re.search(r"/explore/([0-9a-fA-F]{10,})", s)
        if m:
            return m.group(1)
        if re.fullmatch(r"[0-9a-fA-F]{10,}", s):
            return s
        return ""

    if platform == "bili":
        m = re.search(r"(BV[0-9A-Za-z]{6,})", s)
        if m:
            return m.group(1)
        m = re.search(r"av(\d+)", s, flags=re.IGNORECASE)
        if m:
            return f"av{m.group(1)}"
        if re.fullmatch(r"\d{3,}", s):
            return f"av{s}"
        return ""

    return ""


def build_xhs_explore_url(note_id: str) -> str:
    note_id = str(note_id or "").strip()
    if not note_id:
        return ""
    return f"https://www.xiaohongshu.com/explore/{note_id}"


def base_data_dir() -> Path:
    return Path(config.SAVE_DATA_PATH) if config.SAVE_DATA_PATH else Path("data")


def storage_platform_dirname(*, platform: str) -> str:
    if platform == "dy":
        return "douyin"
    return platform


def jsonl_dir(*, platform: str) -> Path:
    return base_data_dir() / storage_platform_dirname(platform=platform) / "jsonl"


def ocr_cache_dir(*, platform: str) -> Path:
    return base_data_dir() / storage_platform_dirname(platform=platform) / "ocr_cache"


def search_rank_key(*, platform: str, content: Dict[str, Any]) -> int:
    if platform == "dy":
        try:
            return int(content.get("liked_count") or 0)
        except Exception:
            return 0
    if platform == "xhs":
        def _i(x: Any) -> int:
            try:
                return int(x or 0)
            except Exception:
                return 0

        return _i(content.get("liked_count")) + _i(content.get("collected_count")) + _i(content.get("comment_count"))
    if platform == "bili":
        try:
            return int(content.get("create_time") or content.get("pubdate") or 0)
        except Exception:
            return 0
    return 0


def apply_cookie_overrides(*, platform: str, args: Any) -> None:
    if platform != "xhs":
        return
    xhs_cookie = str(getattr(args, "xhs_cookie", "") or "").strip()
    if xhs_cookie:
        config.COOKIES = xhs_cookie

    if not str(config.COOKIES or "").strip():
        print(
            "[WARN] XHS 未检测到有效 Cookie：search/detail 可能触发登录墙或风控失败。建议使用 --xhs-cookie 或在 config.COOKIES 配置登录态。"
        )


def normalize_specified_id(*, platform: str, specified_id: str) -> str:
    if platform != "xhs":
        return specified_id
    s = str(specified_id or "").strip()
    if not s:
        return s
    if s.startswith("http://") or s.startswith("https://"):
        return s
    note_id = parse_video_id(platform="xhs", url_or_id=s)
    if not note_id:
        return s
    return build_xhs_explore_url(note_id)


def xhs_search_risk_warning(*, err: Exception) -> None:
    print(
        "[WARN] XHS search 抓取失败：疑似风控/登录态问题（Cookie 无效或缺失 / xsec_token 不可用）。建议：\n"
        "  1) 使用 --xhs-cookie 提供登录态\n"
        "  2) 或优先使用 detail 模式（传入完整笔记URL含 xsec_token）\n"
        f"  原因: {err}"
    )


def comment_owner_field(*, platform: str) -> str:
    if platform == "dy":
        return "aweme_id"
    if platform == "xhs":
        return "note_id"
    if platform == "bili":
        return "video_id"
    return "aweme_id"


def content_id_field(*, platform: str) -> str:
    if platform == "dy":
        return "aweme_id"
    if platform == "xhs":
        return "note_id"
    if platform == "bili":
        return "video_id"
    return "aweme_id"


def candidate_from_content(*, platform: str, content: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if platform == "dy":
        aweme_id = str(content.get("aweme_id") or "").strip()
        if not aweme_id:
            return None
        return {
            "video_id": aweme_id,
            "video_url": str(content.get("aweme_url") or ""),
            "video_download_url": str(content.get("video_download_url") or ""),
            "rank": search_rank_key(platform="dy", content=content),
            "source_keyword": str(content.get("source_keyword") or ""),
        }

    if platform == "xhs":
        note_id = str(content.get("note_id") or "").strip()
        if not note_id:
            note_id = parse_video_id(platform="xhs", url_or_id=str(content.get("note_url") or ""))
        if not note_id:
            return None
        note_url = str(content.get("note_url") or "") or build_xhs_explore_url(note_id)
        video_url = str(content.get("video_url") or "")
        first_video = video_url.split(",")[0].strip() if video_url else ""
        return {
            "video_id": note_id,
            "video_url": note_url,
            "video_download_url": first_video,
            "rank": search_rank_key(platform="xhs", content=content),
            "source_keyword": str(content.get("source_keyword") or ""),
        }

    if platform == "bili":
        video_id = str(content.get("video_id") or "").strip()
        if not video_id:
            video_id = parse_video_id(platform="bili", url_or_id=str(content.get("video_url") or ""))
        if not video_id:
            return None
        video_url = str(content.get("video_url") or "")
        if not video_url:
            video_url = f"https://www.bilibili.com/video/{video_id}"
        return {
            "video_id": video_id,
            "video_url": video_url,
            "video_download_url": "",
            "rank": search_rank_key(platform="bili", content=content),
            "source_keyword": str(content.get("source_keyword") or ""),
        }

    return None
