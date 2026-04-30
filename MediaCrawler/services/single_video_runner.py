import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from pipelines.analysis_pipeline import AnalysisPipeline
from services.asr_transcribe import ASRService
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
    ) -> SingleRunResult:
        mvp_output_path = run_context.output_path(kind="mvp_output", index=index, aweme_id=candidate.aweme_id)
        mvp_analysis_path = run_context.output_path(kind="mvp_analysis", index=index, aweme_id=candidate.aweme_id)
        mvp_report_path = run_context.output_path(kind="mvp_report", index=index, aweme_id=candidate.aweme_id)

        download_dir = run_context.run_dir() / "_downloads"

        local_path: Optional[Path] = None
        try:
            local_path = await self.download_service.download(candidate.video_download_url or candidate.aweme_url, download_dir)
            transcript = await self.asr_service.transcribe(local_path, language="zh")

            payload: Dict[str, Any] = {
                "aweme_id": candidate.aweme_id,
                "video_url": candidate.aweme_url,
                "video_download_url": candidate.video_download_url,
                "source_keyword": candidate.source_keyword,
                "liked_count": candidate.liked_count,
                "local_path": str(local_path),
                "transcript": transcript,
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
