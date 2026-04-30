import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

import config

from pipelines.analysis_pipeline import AnalysisPipeline
from services.asr_transcribe import ASRService
from services.comment_processor import CommentProcessor
from services.ocr_postprocessor import OCRPostprocessor
from services.ocr_service import OCRService, OCRServiceUnavailable, load_ocr_cache, save_ocr_cache
from services.platform_adapter import comment_owner_field, jsonl_dir, ocr_cache_dir
from services.run_context import RunContext
from services.search_reader import VideoCandidate
from services.video_download import VideoDownloadService


@dataclass(frozen=True)
class SingleRunResult:
    status: str
    aweme_id: str
    error_stage: str
    error_code: str
    error_message: str


class SingleVideoRunner:
    def __init__(self) -> None:
        self.download_service = VideoDownloadService()
        self.asr_service = ASRService(model_name="small")
        self.comment_processor = CommentProcessor()
        self.ocr_postprocessor = OCRPostprocessor()
        self.ocr_service = None

    async def run_one(
        self,
        *,
        index: int,
        candidate: VideoCandidate,
        run_context: RunContext,
        enable_llm: bool,
        llm_model: str,
        llm_base_url: str,
        llm_api_key: str,
        output_format: str,
        top_comments: Optional[int] = None,
        top_replies: Optional[int] = None,
        force_regrab: bool = False,
    ) -> SingleRunResult:
        mvp_output_path = run_context.output_path(kind="mvp_output", index=index, aweme_id=candidate.aweme_id)
        mvp_analysis_path = run_context.output_path(kind="mvp_analysis", index=index, aweme_id=candidate.aweme_id)
        mvp_report_path = run_context.output_path(kind="mvp_report", index=index, aweme_id=candidate.aweme_id)

        download_dir = run_context.run_dir() / "_downloads"

        local_path: Optional[Path] = None
        try:
            local_path = await self.download_service.download(candidate.video_download_url or candidate.aweme_url, download_dir)
            asr_task = asyncio.create_task(self.asr_service.transcribe(local_path, language="zh"))
            ocr_task = asyncio.create_task(self._run_ocr(aweme_id=candidate.aweme_id, video_path=local_path))
            transcript, (ocr_text, ocr_summary) = await asyncio.gather(asr_task, ocr_task)

            comments_struct = None
            if config.ENABLE_GET_COMMENTS:
                raw = self._load_cached_comments(aweme_id=candidate.aweme_id)
                comment_source = "cache" if raw else "none"
                if (not raw) or force_regrab:
                    fetched = await self._best_effort_online_grab(aweme_id=candidate.aweme_id, max_root=int(top_comments or config.TOP_COMMENTS_LIMIT))
                    if fetched:
                        raw = fetched
                        comment_source = "online"

                if raw:
                    keep_replies = int(top_replies or config.TOP_REPLIES_LIMIT) if config.ENABLE_GET_SUB_COMMENTS else 0
                    comments_struct = self.comment_processor.build(
                        raw_comments=raw,
                        top_comments=int(top_comments or config.TOP_COMMENTS_LIMIT),
                        top_replies=keep_replies,
                        budget_chars=16000,
                    )
                    st = comments_struct.get("stats") or {}
                    print(
                        f"[INFO] 评论数据来源: {comment_source}\n"
                        f"[INFO] 规范化评论: 一级 {st.get('total_root_comments', 0)} 条, 回复 {st.get('total_replies', 0)} 条, 已截断: {st.get('truncated', False)}"
                    )
                else:
                    print("[WARN] 评论抓取失败：无缓存且在线抓取未执行或失败，将以空评论继续分析")

            payload: Dict[str, Any] = {
                "aweme_id": candidate.aweme_id,
                "video_url": candidate.aweme_url,
                "video_download_url": candidate.video_download_url,
                "source_keyword": candidate.source_keyword,
                "liked_count": candidate.liked_count,
                "local_path": str(local_path),
                "transcript": transcript,
                "ocr_text": ocr_text,
                "ocr_summary": ocr_summary,
                "comments": comments_struct,
                "status": "success",
            }
            mvp_output_path.parent.mkdir(parents=True, exist_ok=True)
            mvp_output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

            if enable_llm:
                analysis_pipeline = AnalysisPipeline(
                    input_mvp_output_file=mvp_output_path,
                    output_analysis_file=mvp_analysis_path,
                    output_report_file=None if output_format == "jsonl" else mvp_report_path,
                )
                await analysis_pipeline.run(model=llm_model, api_base=llm_base_url, api_key=llm_api_key)
            else:
                mvp_analysis_path.write_text(
                    json.dumps(
                        {
                            "status": "success",
                            "aweme_id": candidate.aweme_id,
                            "video_url": candidate.aweme_url,
                            "source_keyword": candidate.source_keyword,
                            "knowledge_points": [],
                            "comment_value_judge": {"missing_comments": True, "items": []},
                            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cost_usd": 0.0},
                        },
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding="utf-8",
                )

            if output_format == "markdown":
                if mvp_output_path.exists():
                    await asyncio.to_thread(mvp_output_path.unlink)
                if mvp_analysis_path.exists():
                    await asyncio.to_thread(mvp_analysis_path.unlink)

            return SingleRunResult(status="success", aweme_id=candidate.aweme_id, error_stage="", error_code="", error_message="")

        except Exception as e:
            return SingleRunResult(status="failed", aweme_id=candidate.aweme_id, error_stage="unknown", error_code="ERR_PHASE25_RUN_ONE", error_message=str(e))

        finally:
            if local_path and local_path.exists():
                try:
                    await asyncio.to_thread(local_path.unlink)
                except Exception:
                    pass

    def _comments_cache_dir(self) -> Path:
        return jsonl_dir(platform=str(config.PLATFORM or "dy"))

    def _ocr_cache_dir(self) -> Path:
        return ocr_cache_dir(platform=str(config.PLATFORM or "dy"))

    async def _run_ocr(self, *, aweme_id: str, video_path: Path):
        if not config.OCR_ENABLED:
            return None, None
        if not aweme_id:
            return None, None

        cache_dir = self._ocr_cache_dir()
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

    def _load_cached_comments(self, *, aweme_id: str) -> list[Dict[str, Any]]:
        folder = self._comments_cache_dir()
        files = list(folder.glob("*_comments_*.jsonl"))
        files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        out: list[Dict[str, Any]] = []
        owner_field = comment_owner_field(platform=str(config.PLATFORM or "dy"))
        for f in files:
            try:
                for ln in f.read_text(encoding="utf-8").splitlines():
                    ln = ln.strip()
                    if not ln:
                        continue
                    obj = json.loads(ln)
                    if isinstance(obj, dict) and str(obj.get(owner_field) or "") == aweme_id:
                        out.append(obj)
            except Exception:
                continue
            if out:
                return out
        return out

    async def _best_effort_online_grab(self, *, aweme_id: str, max_root: int) -> Optional[list[Dict[str, Any]]]:
        if not config.ENABLE_GET_COMMENTS:
            return None
        try:
            from media_platform.douyin.core import DouYinCrawler

            old_platform = config.PLATFORM
            old_crawler_type = config.CRAWLER_TYPE
            try:
                config.PLATFORM = "dy"
                config.CRAWLER_TYPE = "detail"
                config.DY_SPECIFIED_ID_LIST = [aweme_id]
                config.CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES = max_root

                crawler = DouYinCrawler()
                await crawler.get_specified_awemes()
            finally:
                config.PLATFORM = old_platform
                config.CRAWLER_TYPE = old_crawler_type

            return self._load_cached_comments(aweme_id=aweme_id)
        except Exception:
            return None
