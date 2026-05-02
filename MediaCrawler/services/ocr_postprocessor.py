import json
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple


def _parse_hhmmss(ts: str) -> int:
    try:
        parts = ts.split(":")
        if len(parts) != 3:
            return 0
        h, m, s = [int(x) for x in parts]
        return h * 3600 + m * 60 + s
    except Exception:
        return 0


def _bbox_center(bbox: Optional[List[int]]) -> Optional[Tuple[float, float]]:
    if not bbox or len(bbox) != 4:
        return None
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _center_distance(a: Optional[Tuple[float, float]], b: Optional[Tuple[float, float]]) -> float:
    if not a or not b:
        return 10_000.0
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return (dx * dx + dy * dy) ** 0.5


class OCRPostprocessor:
    def postprocess(self, blocks: List[Dict[str, Any]], *, token_budget_chars: int) -> Dict[str, Any]:
        if token_budget_chars <= 0:
            token_budget_chars = 1

        total_blocks = len(blocks)
        filtered = [b for b in blocks if isinstance(b, dict) and str(b.get("text") or "").strip()]
        filtered.sort(key=lambda x: (_parse_hhmmss(str(x.get("timestamp") or "")), int(x.get("frame_index") or 0)))

        deduped: List[Dict[str, Any]] = []
        prev: Optional[Dict[str, Any]] = None
        for b in filtered:
            if prev is None:
                deduped.append(b)
                prev = b
                continue
            t1 = str(prev.get("text") or "")
            t2 = str(b.get("text") or "")
            sim = SequenceMatcher(None, t1, t2).ratio()
            d = _center_distance(_bbox_center(prev.get("bbox")), _bbox_center(b.get("bbox")))
            if sim > 0.9 and d < 30.0:
                continue
            deduped.append(b)
            prev = b

        ocr_text_lines: List[str] = []
        for b in deduped:
            ts = str(b.get("timestamp") or "")
            txt = str(b.get("text") or "").strip()
            if not txt:
                continue
            ocr_text_lines.append(f"[{ts}] {txt}".strip())

        ocr_text = "\n".join(ocr_text_lines)
        truncated = False
        if len(ocr_text) > token_budget_chars:
            truncated = True
            while ocr_text_lines and len("\n".join(ocr_text_lines)) > token_budget_chars:
                ocr_text_lines.pop()
            ocr_text = "\n".join(ocr_text_lines)

        key_texts = []
        for b in sorted(deduped, key=lambda x: float(x.get("confidence") or 0.0), reverse=True):
            t = str(b.get("text") or "").strip()
            if not t:
                continue
            if t not in key_texts:
                key_texts.append(t)
            if len(key_texts) >= 10:
                break

        source_distribution = {"subtitle": 0, "ppt": 0, "cover": 0}
        for b in deduped:
            bbox = b.get("bbox")
            if isinstance(bbox, list) and len(bbox) == 4:
                y1 = int(bbox[1])
                source_distribution["subtitle" if y1 >= 600 else "ppt"] += 1
            else:
                source_distribution["ppt"] += 1

        return {
            "ocr_text": ocr_text,
            "ocr_summary": {
                "total_blocks": total_blocks,
                "key_texts": key_texts,
                "source_distribution": source_distribution,
                "truncated": truncated,
            },
            "blocks": deduped,
        }


def dumps_ocr_text(blocks: List[Dict[str, Any]]) -> str:
    return json.dumps(blocks, ensure_ascii=False)

