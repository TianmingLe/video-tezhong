from services.report_renderer import render_report


def test_report_contains_sections():
    md = render_report(
        video_url="u",
        transcript="t",
        valuable_comments=[{"comment_text": "c", "tags": ["#x"], "reason": "r"}],
        knowledge_points=[{"title": "k", "content": "cc", "timestamp": "00:00:01.000"}],
        suggestions=["s1"],
    )
    assert "## 视频信息" in md
    assert "## 知识点" in md
    assert "## 高价值评论" in md
    assert "## 可执行建议" in md

