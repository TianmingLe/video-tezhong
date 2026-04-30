import asyncio
import json
from pathlib import Path


class _FakeAnalyzer:
    async def analyze(self, **kwargs):
        return {
            "status": "success",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2, "cost_usd": 0.0},
            "comment_value_judge": {"missing_comments": True, "items": []},
            "knowledge_points": [],
            "suggestions": ["s"],
        }


def test_analysis_pipeline_writes_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    Path("results").mkdir(parents=True, exist_ok=True)
    Path("results/mvp_output.json").write_text(
        json.dumps({"video_url": "u", "transcript": "t", "source_contents_file": "x"}, ensure_ascii=False),
        encoding="utf-8",
    )

    from pipelines.analysis_pipeline import AnalysisPipeline

    p = AnalysisPipeline(analyzer=_FakeAnalyzer())
    out = asyncio.run(p.run(model="m", api_base="b", api_key="k"))
    assert out["status"] == "success"
    assert Path("results/mvp_analysis.json").exists()
    assert Path("results/mvp_report.md").exists()

