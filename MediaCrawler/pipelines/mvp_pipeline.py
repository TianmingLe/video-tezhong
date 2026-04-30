import asyncio
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Protocol, Tuple

import config

from services.asr_transcribe import ASRService, ASRServiceError
from services.ocr_postprocessor import OCRPostprocessor
from services.ocr_service import OCRService, OCRServiceUnavailable, load_ocr_cache, save_ocr_cache
from services.video_download import (
    DownloadServiceError,
    DownloadServiceErrorCode,
    VideoDownloadService,
)


class DownloadService(Protocol):
    async def download(self, url: str, output_dir: Path) -> Path: ...


class TranscribeService(Protocol):
    async def transcribe(self, video_path: Path, *, language: str = "zh") -> str: ...


class OCRLike(Protocol):
    def extract_text_from_video(self, *, video_path: Path, interval_sec: int = 5): ...


@dataclass
class MVPPipelineConfig:
    results_file: Path = Path("results/mvp_output.json")
    download_dir: Path = Path("data/_downloads")
    language: str = "zh"


class MVPPipeline:
    def __init__(
        self,
        *,
        platform: str,
        download_service: Optional[DownloadService] = None,
        asr_service: Optional[TranscribeService] = None,
        ocr_service: Optional[OCRLike] = None,
        pipeline_config: Optional[MVPPipelineConfig] = None,
    ) -> None:
        self.platform = platform
        self.download_service = download_service or VideoDownloadService()
        self.asr_service = asr_service or ASRService(model_name="small")
        self.ocr_service = ocr_service
        self.ocr_postprocessor = OCRPostprocessor()
        self.pipeline_config = pipeline_config or MVPPipelineConfig()

    async def _run_crawler(self, specified_id: str) -> None:
        if self.platform != "dy":
            raise ValueError("mvp pipeline phase 1 only supports dy")

        config.PLATFORM = "dy"
        config.CRAWLER_TYPE = "detail"
        config.ENABLE_GET_MEIDAS = False
        config.DY_SPECIFIED_ID_LIST = [specified_id]

        from media_platform.douyin import DouYinCrawler

        crawler = DouYinCrawler()
        await crawler.start()

    def _find_latest_source_contents_file(self) -> Path:
        if self.platform != "dy":
            raise ValueError("mvp pipeline phase 1 only supports dy")

        base = Path(config.SAVE_DATA_PATH) if config.SAVE_DATA_PATH else Path("data")
        folder = base / "douyin" / "jsonl"
        pattern = "detail_contents_*.jsonl"
        candidates = list(folder.glob(pattern))
        if not candidates:
            raise FileNotFoundError(f"未找到数据文件：{folder}/{pattern}")

        candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return candidates[0]

    def _read_last_content_item(self, source_file: Path) -> Dict[str, Any]:
        with source_file.open("r", encoding="utf-8") as f:
            lines = [ln.strip() for ln in f.readlines() if ln.strip()]
        if not lines:
            raise ValueError(f"源文件为空：{source_file}")
        return json.loads(lines[-1])

    def _write_output(self, output: Dict[str, Any]) -> None:
        out_file = self.pipeline_config.results_file
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    def _extract_aweme_id(self, specified_id: str, *, video_url: str) -> str:
        s = specified_id or ""
        m = re.search(r"(\d{8,})", s)
        if m:
            return m.group(1)
        m = re.search(r"(\d{8,})", video_url or "")
        if m:
            return m.group(1)
        return ""

    async def _run_ocr(self, *, aweme_id: str, video_path: Path) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
        if not config.OCR_ENABLED:
            return None, None
        if not aweme_id:
            return None, None

        base = Path(config.SAVE_DATA_PATH) if config.SAVE_DATA_PATH else Path("data")
        cache_dir = base / "douyin" / "ocr_cache"
        cached = load_ocr_cache(cache_dir=cache_dir, aweme_id=aweme_id, model=config.OCR_MODEL, interval_sec=int(config.OCR_INTERVAL_SEC))
        if cached and isinstance(cached.get("postprocess"), dict):
            pp = cached.get("postprocess") or {}
            return pp.get("ocr_text"), pp.get("ocr_summary")

        svc = self.ocr_service or OCRService(model=config.OCR_MODEL, use_gpu=bool(config.OCR_USE_GPU))
        try:
            blocks = await asyncio.wait_for(
                asyncio.to_thread(svc.extract_text_from_video, video_path=video_path, interval_sec=int(config.OCR_INTERVAL_SEC)),
                timeout=float(getattr(config, "OCR_TIMEOUT_SECONDS", 120)),
            )
        except OCRServiceUnavailable:
            return None, None
        except Exception:
            return None, None

        pp = self.ocr_postprocessor.postprocess(list(blocks or []), token_budget_chars=9000)
        payload = {
            "aweme_id": aweme_id,
            "interval_sec": int(config.OCR_INTERVAL_SEC),
            "model": config.OCR_MODEL,
            "blocks": pp.get("blocks") or [],
            "postprocess": {"ocr_text": pp.get("ocr_text") or "", "ocr_summary": pp.get("ocr_summary") or {}},
        }
        save_ocr_cache(cache_dir=cache_dir, aweme_id=aweme_id, payload=payload)
        return pp.get("ocr_text") or "", pp.get("ocr_summary") or {}

    async def run(self, *, specified_id: str) -> Dict[str, Any]:
        local_path: Optional[Path] = None
        source_file: Optional[Path] = None
        video_url: str = ""
        download_url: str = ""

        try:
            await self._run_crawler(specified_id)

            source_file = self._find_latest_source_contents_file()
            item = self._read_last_content_item(source_file)

            video_url = str(item.get("aweme_url") or "")
            download_url = str(item.get("video_download_url") or "")
            if not download_url:
                download_url = video_url

            local_path = await self.download_service.download(download_url, self.pipeline_config.download_dir)
            aweme_id = self._extract_aweme_id(specified_id, video_url=video_url)
            asr_task = asyncio.create_task(self.asr_service.transcribe(local_path, language=self.pipeline_config.language))
            ocr_task = asyncio.create_task(self._run_ocr(aweme_id=aweme_id, video_path=local_path))
            transcript, (ocr_text, ocr_summary) = await asyncio.gather(asr_task, ocr_task)

            output: Dict[str, Any] = {
                "aweme_id": aweme_id,
                "video_url": video_url,
                "local_path": str(local_path),
                "transcript": transcript,
                "ocr_text": ocr_text,
                "ocr_summary": ocr_summary,
                "status": "success",
                "source_contents_file": str(source_file),
            }
            self._write_output(output)
            return output

        except DownloadServiceError as e:
            output = {
                "video_url": video_url,
                "local_path": str(local_path) if local_path else "",
                "transcript": "",
                "status": "error",
                "error_code": e.code.value,
                "error_message": e.message,
                "source_contents_file": str(source_file) if source_file else "",
            }
            self._write_output(output)
            return output

        except ASRServiceError as e:
            output = {
                "video_url": video_url,
                "local_path": str(local_path) if local_path else "",
                "transcript": "",
                "status": "error",
                "error_code": e.code.value,
                "error_message": e.message,
                "source_contents_file": str(source_file) if source_file else "",
            }
            self._write_output(output)
            return output

        except Exception as e:
            output = {
                "video_url": video_url,
                "local_path": str(local_path) if local_path else "",
                "transcript": "",
                "status": "error",
                "error_code": DownloadServiceErrorCode.DOWNLOAD_FAILED.value,
                "error_message": str(e),
                "source_contents_file": str(source_file) if source_file else "",
            }
            self._write_output(output)
            return output

        finally:
            if local_path and local_path.exists():
                try:
                    await asyncio.to_thread(local_path.unlink)
                except Exception:
                    pass
