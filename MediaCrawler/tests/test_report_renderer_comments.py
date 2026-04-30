from services.report_renderer import render_report


def test_report_contains_comment_sections():
    md = render_report(
        video_url="u",
        transcript="t",
        valuable_comments=[{"comment_text": "c", "tags": ["#x"], "reason": "r"}],
        knowledge_points=[],
        suggestions=[],
        community_insights={"consensus": ["a"], "controversy": ["b"]},
    )
    assert "## 💬 高赞评论精选" in md
    assert "## 🗣️ 社区共识与争议" in md

