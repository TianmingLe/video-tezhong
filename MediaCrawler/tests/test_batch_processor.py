import asyncio

from services.run_context import RunContext
from services.search_reader import VideoCandidate


class _FakeSingleRunner:
    def __init__(self):
        self.calls = 0

    async def run_one(self, **kwargs):
        self.calls += 1
        return {"status": "success"}


def test_batch_skips_existing(tmp_path):
    ctx = RunContext(run_root=tmp_path, run_id="r")
    ctx.run_dir().mkdir(parents=True, exist_ok=True)
    ctx.output_path(kind="mvp_analysis", index=1, aweme_id="1").write_text("{}", encoding="utf-8")

    candidates = [
        VideoCandidate(aweme_id="1", aweme_url="u1", video_download_url="d1", liked_count=2, source_keyword="k")
    ]
    fake = _FakeSingleRunner()

    from services.batch_processor import BatchProcessor

    bp = BatchProcessor(run_context=ctx, single_runner=fake)
    asyncio.run(bp.run(candidates=candidates, limit=1, dry_run=False))
    assert fake.calls == 0

