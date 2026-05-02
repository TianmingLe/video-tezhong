from services.run_context import RunContext


def test_run_context_paths(tmp_path):
    ctx = RunContext(run_root=tmp_path, run_id="20260422_103000_AI教程")
    p = ctx.output_path(kind="mvp_output", index=1, aweme_id="123")
    assert p.name == "mvp_output_001_123.json"

