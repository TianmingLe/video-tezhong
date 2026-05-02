import asyncio
import json
from pathlib import Path


def test_analysis_pipeline_passes_comments(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    Path("in").mkdir()
    Path("out").mkdir()
    Path("in/mvp_output.json").write_text(
        json.dumps(
            {"video_url": "u", "transcript": "t", "comments": {"root_comments": [], "stats": {"total_comments": 0}}},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    class _FakeAnalyzer:
        def __init__(self):
            self.seen = None

        async def analyze(self, **kwargs):
            self.seen = kwargs.get("comments")
            return {"status": "success", "comment_value_judge": {"items": []}, "knowledge_points": [], "suggestions": []}

    from pipelines.analysis_pipeline import AnalysisPipeline

    a = _FakeAnalyzer()
    p = AnalysisPipeline(
        analyzer=a,
        input_mvp_output_file=Path("in/mvp_output.json"),
        output_analysis_file=Path("out/a.json"),
        output_report_file=Path("out/r.md"),
    )
    asyncio.run(p.run(model="m", api_base="b", api_key="k"))
    assert a.seen is not None

