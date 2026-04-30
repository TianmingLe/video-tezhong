import asyncio
import json

from services.run_context import RunContext
from services.search_reader import VideoCandidate


def test_dry_run_writes_plan(tmp_path):
    ctx = RunContext(run_root=tmp_path, run_id="r")
    candidates = [
        VideoCandidate(aweme_id="2", aweme_url="u2", video_download_url="d2", liked_count=10, source_keyword="k"),
        VideoCandidate(aweme_id="1", aweme_url="u1", video_download_url="d1", liked_count=2, source_keyword="k"),
    ]

    from services.batch_processor import BatchProcessor

    bp = BatchProcessor(run_context=ctx)
    asyncio.run(bp.run(candidates=candidates, limit=1, dry_run=True))
    plan = json.loads(ctx.dry_run_plan_path().read_text(encoding="utf-8"))
    assert plan["will_process_top_n"] == 1
    assert plan["plan"][0]["aweme_id"] == "2"

