import asyncio
import json
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict

import pytest


class _FakeYDL:
    def __init__(self, opts: Dict[str, Any]):
        self.opts = opts

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def extract_info(self, url: str, download: bool = True) -> Dict[str, Any]:
        outtmpl = self.opts.get("outtmpl")
        assert isinstance(outtmpl, str)
        target = Path(outtmpl % {"id": "fake", "ext": "mp4"})
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"fake-video-bytes")
        return {"id": "fake", "ext": "mp4", "_filename": str(target)}

    def prepare_filename(self, info_dict: Dict[str, Any]) -> str:
        return info_dict["_filename"]


class _FakeYDLInvalidURL:
    def __init__(self, opts: Dict[str, Any]):
        self.opts = opts

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def extract_info(self, url: str, download: bool = True) -> Dict[str, Any]:
        raise Exception("Unsupported URL")


class _FakeWhisperModel:
    def transcribe(self, video_path: str, language: str = "zh", **kwargs) -> Dict[str, Any]:
        return {
            "segments": [
                {"start": 0.0, "end": 1.2, "text": "你好"},
                {"start": 1.2, "end": 2.5, "text": "世界"},
            ]
        }


def test_video_download_service_download_success(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    fake_yt_dlp = SimpleNamespace(YoutubeDL=_FakeYDL)
    monkeypatch.setitem(sys.modules, "yt_dlp", fake_yt_dlp)

    from services.video_download import VideoDownloadService

    out_dir = tmp_path / "downloads"
    svc = VideoDownloadService()
    local_path = asyncio.run(svc.download("https://example.com/video", out_dir))

    assert local_path.exists()
    assert local_path.read_bytes() == b"fake-video-bytes"


def test_asr_service_transcribe_timestamped_text(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    fake_whisper = SimpleNamespace(load_model=lambda name: _FakeWhisperModel())
    monkeypatch.setitem(sys.modules, "whisper", fake_whisper)
    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/ffmpeg")

    from services.asr_transcribe import ASRService

    video_file = tmp_path / "a.mp4"
    video_file.write_bytes(b"x")

    svc = ASRService(model_name="small")
    transcript = asyncio.run(svc.transcribe(video_file, language="zh"))

    assert "00:00:00.000" in transcript
    assert "你好" in transcript
    assert "世界" in transcript


def test_mvp_pipeline_outputs_json_and_deletes_video(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.chdir(tmp_path)
    import config

    config.PLATFORM = "dy"

    data_dir = tmp_path / "data" / "douyin" / "jsonl"
    data_dir.mkdir(parents=True, exist_ok=True)
    source_file = data_dir / "detail_contents_2099-01-01.jsonl"
    content_item = {
        "aweme_id": "123",
        "aweme_url": "https://www.douyin.com/video/123",
        "video_download_url": "https://example.com/direct.mp4",
    }
    source_file.write_text(json.dumps(content_item, ensure_ascii=False) + "\n", encoding="utf-8")

    class _FakeDownloadService:
        async def download(self, url: str, output_dir: Path) -> Path:
            output_dir.mkdir(parents=True, exist_ok=True)
            p = output_dir / "v.mp4"
            p.write_bytes(b"v")
            return p

    class _FakeASRService:
        async def transcribe(self, video_path: Path, language: str = "zh") -> str:
            assert video_path.exists()
            return "[00:00:00.000 --> 00:00:01.000] ok"

    from pipelines.mvp_pipeline import MVPPipeline

    pipeline = MVPPipeline(
        platform="dy",
        download_service=_FakeDownloadService(),
        asr_service=_FakeASRService(),
    )

    async def _noop(specified_id: str) -> None:
        return None

    monkeypatch.setattr(pipeline, "_run_crawler", _noop)

    output = asyncio.run(pipeline.run(specified_id="123"))

    assert output["status"] == "success"
    assert output["video_url"] == "https://www.douyin.com/video/123"
    assert output["source_contents_file"].endswith("detail_contents_2099-01-01.jsonl")

    local_path = Path(output["local_path"])
    assert not local_path.exists()

    output_file = tmp_path / "results" / "mvp_output.json"
    assert output_file.exists()
    written = json.loads(output_file.read_text(encoding="utf-8"))
    assert written["video_url"] == "https://www.douyin.com/video/123"


def test_mvp_pipeline_error_code_on_invalid_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.chdir(tmp_path)
    import config

    config.PLATFORM = "dy"

    data_dir = tmp_path / "data" / "douyin" / "jsonl"
    data_dir.mkdir(parents=True, exist_ok=True)
    source_file = data_dir / "detail_contents_2099-01-01.jsonl"
    content_item = {
        "aweme_url": "https://www.douyin.com/video/123",
        "video_download_url": "https://example.com/direct.mp4",
    }
    source_file.write_text(json.dumps(content_item, ensure_ascii=False) + "\n", encoding="utf-8")

    fake_yt_dlp = SimpleNamespace(YoutubeDL=_FakeYDLInvalidURL)
    monkeypatch.setitem(sys.modules, "yt_dlp", fake_yt_dlp)

    from services.video_download import DownloadServiceErrorCode, VideoDownloadService
    from services.asr_transcribe import ASRService
    from pipelines.mvp_pipeline import MVPPipeline

    pipeline = MVPPipeline(
        platform="dy",
        download_service=VideoDownloadService(),
        asr_service=ASRService(model_name="small"),
    )

    async def _noop(specified_id: str) -> None:
        return None

    monkeypatch.setattr(pipeline, "_run_crawler", _noop)

    output = asyncio.run(pipeline.run(specified_id="123"))

    assert output["status"] == "error"
    assert output["error_code"] == DownloadServiceErrorCode.INVALID_URL.value
