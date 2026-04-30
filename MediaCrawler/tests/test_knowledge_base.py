import json
from pathlib import Path


def test_kb_aggregates_success_only(tmp_path):
    run_dir = tmp_path / "runs/r"
    run_dir.mkdir(parents=True, exist_ok=True)

    (run_dir / "mvp_analysis_001_1.json").write_text(
        json.dumps(
            {
                "status": "success",
                "video_url": "u1",
                "knowledge_points": [{"title": "t1", "content": "c1", "timestamp": "00:00:01.000"}],
                "comment_value_judge": {"items": [{"tags": ["#a"]}]},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (run_dir / "mvp_analysis_002_2.json").write_text(
        json.dumps({"status": "error"}, ensure_ascii=False),
        encoding="utf-8",
    )

    from services.knowledge_base import KnowledgeBase

    kb = KnowledgeBase(run_dir=run_dir, run_id="r")
    kb.build(use_llm=False)

    assert (run_dir / "kb_index_r.jsonl").exists()
    assert (run_dir / "kb_tags_r.json").exists()
    assert (run_dir / "kb_summary_r.md").exists()

