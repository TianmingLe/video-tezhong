import asyncio
import json
from pathlib import Path

import config


def test_single_video_runner_writes_ocr_fields(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    config.PLATFORM = "dy"
    config.OCR_ENABLED = True
    config.OCR_INTERVAL_SEC = 5
    config.OCR_MODEL = "ppocr_v4"
    config.OCR_USE_GPU = False
    config.OCR_TIMEOUT_SECONDS = 120

    from services.search_reader import VideoCandidate
    from services.run_context import RunContext
    from services.single_video_runner import SingleVideoRunner

    class _FakeDownload:
        async def download(self, url: str, output_dir: Path) -> Path:
            output_dir.mkdir(parents=True, exist_ok=True)
            p = output_dir / "v.mp4"
            p.write_text("x", encoding="utf-8")
            return p

    class _FakeASR:
        async def transcribe(self, video_path: Path, *, language: str = "zh") -> str:
            return "t"

    class _FakeOCR:
        def extract_text_from_video(self, *, video_path: Path, interval_sec: int = 5):
            return [
                {"text": "A", "confidence": 0.9, "timestamp": "00:00:05", "bbox": [0, 0, 10, 10], "frame_index": 1}
            ]

    r = SingleVideoRunner()
    r.download_service = _FakeDownload()
    r.asr_service = _FakeASR()
    r.ocr_service = _FakeOCR()

    ctx = RunContext(run_root=Path("."), run_id="r")
    c = VideoCandidate(aweme_id="a", aweme_url="u", video_download_url="u", liked_count=1, source_keyword="k")
    asyncio.run(
        r.run_one(
            index=1,
            candidate=c,
            run_context=ctx,
            enable_llm=False,
            llm_model="",
            llm_base_url="",
            llm_api_key="",
            output_format="all",
        )
    )
    saved = json.loads(ctx.output_path(kind="mvp_output", index=1, aweme_id="a").read_text(encoding="utf-8"))
    assert "ocr_text" in saved
    assert "ocr_summary" in saved
