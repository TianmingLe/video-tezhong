import json
from pathlib import Path


def test_kb_index_has_comments_summary(tmp_path):
    run_dir = tmp_path / "runs/r"
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "mvp_analysis_001_1.json").write_text(
        json.dumps(
            {
                "status": "success",
                "video_url": "u1",
                "knowledge_points": [],
                "comment_value_judge": {"items": [{"tags": ["#a"]}]},
                "community_insights": {"consensus": ["c1"], "controversy": ["v1"]},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    from services.knowledge_base import KnowledgeBase

    kb = KnowledgeBase(run_dir=run_dir, run_id="r")
    kb.build(use_llm=False)
    first = (run_dir / "kb_index_r.jsonl").read_text(encoding="utf-8").splitlines()[0]
    obj = json.loads(first)
    assert "comments_summary" in obj

