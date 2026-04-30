import json
from pathlib import Path


def test_kb_index_has_ocr_summary(tmp_path):
    run_dir = tmp_path / "runs/r"
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "mvp_analysis_001_1.json").write_text(
        json.dumps(
            {
                "status": "success",
                "video_url": "u1",
                "knowledge_points": [],
                "comment_value_judge": {"items": []},
                "ocr_summary": {"total_blocks": 2, "key_texts": ["A", "B"], "source_distribution": {"ppt": 2}},
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
    assert "ocr_summary" in obj

