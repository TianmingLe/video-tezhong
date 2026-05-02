import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Protocol

from services.processed_registry import ProcessedRegistry
from services.run_context import RunContext
from services.search_reader import VideoCandidate


@dataclass(frozen=True)
class ProgressEvent:
    index: int
    total: int
    aweme_id: str
    stage: str
    status: str
    message: str


class SingleVideoRunnerLike(Protocol):
    async def run_one(self, **kwargs) -> Dict[str, Any]: ...


class BatchProcessor:
    def __init__(
        self,
        *,
        run_context: RunContext,
        single_runner: Optional[SingleVideoRunnerLike] = None,
        progress_callback: Optional[Callable[[ProgressEvent], None]] = None,
    ) -> None:
        self.run_context = run_context
        self.single_runner = single_runner
        self.progress_callback = progress_callback

    def _emit(self, ev: ProgressEvent) -> None:
        cb = self.progress_callback
        if cb:
            cb(ev)
            return
        print(f"[PROGRESS] 视频 {ev.index}/{ev.total}({ev.aweme_id}): {ev.message}")

    def _write_json(self, path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    async def run(
        self,
        *,
        candidates: List[VideoCandidate],
        limit: int,
        dry_run: bool,
        output_format: str = "all",
        enable_llm: bool = False,
        llm_model: str = "",
        llm_base_url: str = "",
        llm_api_key: str = "",
        concurrent_limit: int = 3,
        max_retries: int = 3,
        retry_delay: float = 2.0,
    ) -> None:
        if limit < 1:
            limit = 1
        if limit > 50:
            limit = 50

        run_dir = self.run_context.run_dir()
        run_dir.mkdir(parents=True, exist_ok=True)

        ordered = sorted(candidates, key=lambda c: c.liked_count, reverse=True)[:limit]

        registry = ProcessedRegistry(path=self.run_context.processed_ids_path())
        skipped = 0
        for i, c in enumerate(ordered, 1):
            out_analysis_path = self.run_context.output_path(kind="mvp_analysis", index=i, aweme_id=c.aweme_id)
            if out_analysis_path.exists() or registry.is_processed(c.aweme_id):
                skipped += 1

        if dry_run:
            plan = {
                "total_candidates": len(candidates),
                "will_process_top_n": len(ordered),
                "skipped_already_processed": skipped,
                "estimated_time_minutes": None,
                "estimated_token_cost": None,
                "plan": [
                    {"aweme_id": c.aweme_id, "liked_count": c.liked_count, "reason": f"Top {i + 1}"}
                    for i, c in enumerate(ordered)
                ],
            }
            self._write_json(self.run_context.dry_run_plan_path(), plan)
            return

        semaphore = asyncio.Semaphore(concurrent_limit if concurrent_limit > 0 else 1)

        async def _run_one(i: int, c: VideoCandidate) -> None:
            out_analysis_path = self.run_context.output_path(kind="mvp_analysis", index=i, aweme_id=c.aweme_id)
            if out_analysis_path.exists() or registry.is_processed(c.aweme_id):
                return

            async with semaphore:
                self._emit(
                    ProgressEvent(
                        index=i,
                        total=len(ordered),
                        aweme_id=c.aweme_id,
                        stage="start",
                        status="running",
                        message="开始处理",
                    )
                )

                attempts = 0
                while True:
                    attempts += 1
                    try:
                        runner = self.single_runner
                        if runner is None:
                            from services.single_video_runner import SingleVideoRunner

                            runner = SingleVideoRunner()
                        await runner.run_one(
                            index=i,
                            candidate=c,
                            run_context=self.run_context,
                            enable_llm=enable_llm,
                            llm_model=llm_model,
                            llm_base_url=llm_base_url,
                            llm_api_key=llm_api_key,
                            output_format=output_format,
                        )
                        registry.append_success(c.aweme_id)
                        self._emit(
                            ProgressEvent(
                                index=i,
                                total=len(ordered),
                                aweme_id=c.aweme_id,
                                stage="done",
                                status="success",
                                message="完成 ✅",
                            )
                        )
                        return
                    except Exception as e:
                        if attempts <= max_retries:
                            await asyncio.sleep(retry_delay)
                            continue
                        registry.append_failed(
                            aweme_id=c.aweme_id,
                            failed_stage="unknown",
                            error_code="ERR_BATCH_RUN_ONE",
                        )
                        self._emit(
                            ProgressEvent(
                                index=i,
                                total=len(ordered),
                                aweme_id=c.aweme_id,
                                stage="failed",
                                status="failed",
                                message=f"失败 ❌ {e}",
                            )
                        )
                        return

        tasks = [asyncio.create_task(_run_one(i + 1, c)) for i, c in enumerate(ordered)]
        await asyncio.gather(*tasks)
