from services.report_renderer import render_report


def test_report_contains_ocr_section():
    md = render_report(
        video_url="u",
        transcript="t",
        valuable_comments=[],
        knowledge_points=[],
        suggestions=[],
        community_insights={"consensus": [], "controversy": []},
        ocr_summary={"total_blocks": 2, "key_texts": ["A", "B"], "source_distribution": {"subtitle": 2}},
    )
    assert "## 🔤 画面文字要点" in md

