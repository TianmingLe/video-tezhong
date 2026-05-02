import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


class OCRServiceUnavailable(Exception):
    pass


@dataclass(frozen=True)
class TextBlock:
    text: str
    confidence: float
    timestamp: str
    bbox: Optional[List[int]]
    frame_index: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
            "bbox": self.bbox,
            "frame_index": self.frame_index,
        }


def _format_hhmmss(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    total = int(round(seconds))
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


class OCRService:
    def __init__(self, *, model: str, use_gpu: bool) -> None:
        self.model = model
        self.use_gpu = use_gpu
        self._engine = None

    def _get_engine(self):
        if self._engine is not None:
            return self._engine
        try:
            from paddleocr import PaddleOCR  # type: ignore
        except Exception as e:
            raise OCRServiceUnavailable("PaddleOCR is not installed") from e

        self._engine = PaddleOCR(use_angle_cls=True, lang="ch", use_gpu=self.use_gpu)
        return self._engine

    def extract_text_from_video(self, *, video_path: Path, interval_sec: int = 5) -> List[Dict[str, Any]]:
        if not video_path.exists():
            raise FileNotFoundError(str(video_path))
        if interval_sec <= 0:
            interval_sec = 5

        try:
            import cv2  # type: ignore
        except Exception as e:
            raise OCRServiceUnavailable("opencv-python is not installed") from e

        engine = self._get_engine()

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError(f"failed to open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        if fps <= 0:
            fps = 25.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = frame_count / fps if frame_count > 0 else 0.0

        blocks: List[Dict[str, Any]] = []
        t = 0.0
        frame_index = 0
        while t <= duration:
            frame_index = int(round(t * fps))
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, frame = cap.read()
            if not ok or frame is None:
                t += interval_sec
                continue

            result = engine.ocr(frame, cls=True)
            ts = _format_hhmmss(t)
            for page in result or []:
                for item in page or []:
                    try:
                        box = item[0]
                        txt = item[1][0]
                        conf = float(item[1][1])
                    except Exception:
                        continue

                    bbox = None
                    try:
                        xs = [p[0] for p in box]
                        ys = [p[1] for p in box]
                        bbox = [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]
                    except Exception:
                        bbox = None

                    blocks.append(
                        TextBlock(
                            text=str(txt),
                            confidence=conf,
                            timestamp=ts,
                            bbox=bbox,
                            frame_index=frame_index,
                        ).to_dict()
                    )

            t += interval_sec

        cap.release()
        return blocks


def load_ocr_cache(*, cache_dir: Path, aweme_id: str, model: str, interval_sec: int) -> Optional[Dict[str, Any]]:
    p = cache_dir / f"{aweme_id}.json"
    if not p.exists():
        return None
    try:
        obj = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    if str(obj.get("model") or "") != model:
        return None
    if int(obj.get("interval_sec") or 0) != int(interval_sec):
        return None
    return obj


def save_ocr_cache(*, cache_dir: Path, aweme_id: str, payload: Dict[str, Any]) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / f"{aweme_id}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
