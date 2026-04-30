import asyncio
import json
from pathlib import Path


def test_analysis_pipeline_custom_paths(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    Path("in").mkdir()
    Path("out").mkdir()
    in_file = Path("in/mvp_output.json")
    in_file.write_text(json.dumps({"video_url": "u", "transcript": "t"}, ensure_ascii=False), encoding="utf-8")

    class _FakeAnalyzer:
        async def analyze(self, **kwargs):
            return {"status": "success", "comment_value_judge": {"items": []}, "knowledge_points": [], "suggestions": []}

    from pipelines.analysis_pipeline import AnalysisPipeline

    p = AnalysisPipeline(
        analyzer=_FakeAnalyzer(),
        input_mvp_output_file=in_file,
        output_analysis_file=Path("out/a.json"),
        output_report_file=Path("out/r.md"),
    )
    asyncio.run(p.run(model="m", api_base="b", api_key="k"))
    assert Path("out/a.json").exists()
    assert Path("out/r.md").exists()

