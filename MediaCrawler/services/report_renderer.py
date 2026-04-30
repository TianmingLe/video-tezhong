from typing import Any, Dict, List


def render_report(
    *,
    video_url: str,
    transcript: str,
    valuable_comments: List[Dict[str, Any]],
    knowledge_points: List[Dict[str, Any]],
    suggestions: List[str],
) -> str:
    """
    将结构化分析结果渲染为 Markdown 报告。

    说明：
    - Phase 2 先提供稳定的“模板化”报告输出，确保可读与可导出
    - 后续如需更“拟人”的报告，可引入 report_generate prompt 走 LLM 生成
    """

    lines: List[str] = []
    lines.append("# MVP 分析报告")
    lines.append("")

    lines.append("## 视频信息")
    lines.append(f"- video_url: {video_url}")
    lines.append("")

    lines.append("## 知识点")
    if knowledge_points:
        for kp in knowledge_points:
            lines.append(f"- {kp.get('timestamp', '')}: {kp.get('title', '')}")
            content = kp.get("content", "")
            if content:
                lines.append(f"  - {content}")
    else:
        lines.append("- （无）")
    lines.append("")

    lines.append("## 高价值评论")
    if valuable_comments:
        for c in valuable_comments:
            tags = " ".join(c.get("tags") or [])
            lines.append(f"- {tags} {c.get('comment_text', '')}".strip())
            reason = c.get("reason", "")
            if reason:
                lines.append(f"  - {reason}")
    else:
        lines.append("- （无）")
    lines.append("")

    lines.append("## 可执行建议")
    if suggestions:
        for s in suggestions:
            lines.append(f"- {s}")
    else:
        lines.append("- （无）")
    lines.append("")

    return "\n".join(lines)

