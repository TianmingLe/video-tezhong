import asyncio
import json
from pathlib import Path


def test_single_video_runner_comment_cache_first(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    Path("data/douyin/jsonl").mkdir(parents=True, exist_ok=True)
    Path("data/douyin/jsonl/detail_comments_2099-01-01.jsonl").write_text(
        json.dumps(
            {
                "aweme_id": "a",
                "comment_id": "c1",
                "content": "root",
                "like_count": 1,
                "parent_comment_id": "0",
                "nickname": "u",
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    from services.search_reader import VideoCandidate
    from services.run_context import RunContext
    from services.single_video_runner import SingleVideoRunner

    class _FakeDownload:
        async def download(self, *args, **kwargs):
            p = Path("v.mp4")
            p.write_text("x", encoding="utf-8")
            return p

    class _FakeASR:
        async def transcribe(self, *args, **kwargs):
            return "t"

    r = SingleVideoRunner()
    r.download_service = _FakeDownload()
    r.asr_service = _FakeASR()

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
            top_comments=1,
            top_replies=0,
            force_regrab=False,
        )
    )

    mvp = json.loads(ctx.output_path(kind="mvp_output", index=1, aweme_id="a").read_text(encoding="utf-8"))
    assert "comments" in mvp

