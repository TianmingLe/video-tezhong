import asyncio
import json
from pathlib import Path

import config


def test_mvp_pipeline_reads_xhs_detail_contents(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    config.OCR_ENABLED = False

    data_dir = Path("data/xhs/jsonl")
    data_dir.mkdir(parents=True, exist_ok=True)
    source_file = data_dir / "detail_contents_2099-01-01.jsonl"
    source_file.write_text(
        json.dumps(
            {
                "note_id": "n1",
                "note_url": "https://www.xiaohongshu.com/explore/n1?xsec_token=1",
                "video_url": "https://example.com/v.mp4",
                "liked_count": 1,
                "collected_count": 2,
                "comment_count": 3,
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    class _FakeDownloadService:
        async def download(self, url: str, output_dir: Path) -> Path:
            output_dir.mkdir(parents=True, exist_ok=True)
            p = output_dir / "v.mp4"
            p.write_bytes(b"v")
            return p

    class _FakeASRService:
        async def transcribe(self, video_path: Path, language: str = "zh") -> str:
            return "[00:00:00.000 --> 00:00:01.000] ok"

    from pipelines.mvp_pipeline import MVPPipeline

    pipeline = MVPPipeline(platform="xhs", download_service=_FakeDownloadService(), asr_service=_FakeASRService())

    async def _noop(specified_id: str) -> None:
        return None

    monkeypatch.setattr(pipeline, "_run_crawler", _noop)
    out = asyncio.run(pipeline.run(specified_id="n1"))
    assert out["status"] == "success"
    assert out["platform"] == "xhs"
    assert out["video_id"] == "n1"
    assert out["aweme_id"] == "n1"


def test_mvp_pipeline_reads_bili_detail_contents(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    config.OCR_ENABLED = False

    data_dir = Path("data/bili/jsonl")
    data_dir.mkdir(parents=True, exist_ok=True)
    source_file = data_dir / "detail_contents_2099-01-01.jsonl"
    source_file.write_text(
        json.dumps(
            {
                "video_id": "av1",
                "video_url": "https://www.bilibili.com/video/av1",
                "create_time": 1710000000,
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    class _FakeDownloadService:
        async def download(self, url: str, output_dir: Path) -> Path:
            output_dir.mkdir(parents=True, exist_ok=True)
            p = output_dir / "v.mp4"
            p.write_bytes(b"v")
            return p

    class _FakeASRService:
        async def transcribe(self, video_path: Path, language: str = "zh") -> str:
            return "[00:00:00.000 --> 00:00:01.000] ok"

    from pipelines.mvp_pipeline import MVPPipeline

    pipeline = MVPPipeline(platform="bili", download_service=_FakeDownloadService(), asr_service=_FakeASRService())

    async def _noop(specified_id: str) -> None:
        return None

    monkeypatch.setattr(pipeline, "_run_crawler", _noop)
    out = asyncio.run(pipeline.run(specified_id="av1"))
    assert out["status"] == "success"
    assert out["platform"] == "bili"
    assert out["video_id"] == "av1"
    assert out["aweme_id"] == "av1"
