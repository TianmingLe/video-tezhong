import asyncio
import json
from pathlib import Path

import config


def test_mvp_pipeline_writes_ocr_fields(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    config.OCR_ENABLED = True
    config.OCR_INTERVAL_SEC = 5
    config.OCR_MODEL = "ppocr_v4"
    config.OCR_USE_GPU = False
    config.OCR_TIMEOUT_SECONDS = 120

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

    from pipelines.mvp_pipeline import MVPPipeline, MVPPipelineConfig

    data_dir = Path("data/douyin/jsonl")
    data_dir.mkdir(parents=True, exist_ok=True)
    source_file = data_dir / "detail_contents_2099-01-01.jsonl"
    source_file.write_text(
        json.dumps({"aweme_url": "https://www.douyin.com/video/123456789", "video_download_url": "https://example.com/v.mp4"}, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )

    p = MVPPipeline(
        platform="dy",
        download_service=_FakeDownload(),
        asr_service=_FakeASR(),
        pipeline_config=MVPPipelineConfig(results_file=Path("results/mvp_output.json"), download_dir=Path("data/_downloads")),
        ocr_service=_FakeOCR(),
    )

    async def _noop(specified_id: str) -> None:
        return None

    monkeypatch.setattr(p, "_run_crawler", _noop)
    out = asyncio.run(p.run(specified_id="123456789"))
    saved = json.loads(Path("results/mvp_output.json").read_text(encoding="utf-8"))
    assert "ocr_text" in saved
    assert "ocr_summary" in saved
    assert out["ocr_summary"]["total_blocks"] == 1
