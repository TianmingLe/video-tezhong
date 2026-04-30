import json
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple


class KnowledgeBase:
    def __init__(self, *, run_dir: Path, run_id: str) -> None:
        self.run_dir = run_dir
        self.run_id = run_id

    def _analysis_files(self) -> List[Path]:
        files = list(self.run_dir.glob("mvp_analysis_*_*.json"))
        files.sort()
        return files

    def _aweme_id_from_filename(self, p: Path) -> str:
        m = re.match(r"mvp_analysis_\d{3}_(.+)\.json$", p.name)
        return m.group(1) if m else ""

    def _write_json(self, path: Path, data: Dict[str, Any]) -> None:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def _write_jsonl(self, path: Path, rows: List[Dict[str, Any]]) -> None:
        with path.open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

    def _write_md(self, path: Path, text: str) -> None:
        path.write_text(text, encoding="utf-8")

    def build(self, *, use_llm: bool) -> None:
        self.run_dir.mkdir(parents=True, exist_ok=True)

        index_rows: List[Dict[str, Any]] = []
        tag_counts: Dict[str, int] = {}
        knowledge_bag: List[Tuple[str, str, str]] = []
        community_bag: List[Tuple[str, str]] = []

        for f in self._analysis_files():
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue

            if data.get("status") != "success":
                continue

            aweme_id = self._aweme_id_from_filename(f)
            video_url = str(data.get("video_url") or "")
            source_keyword = str(data.get("source_keyword") or "")

            knowledge_points = data.get("knowledge_points") or []
            if not isinstance(knowledge_points, list):
                knowledge_points = []

            citems = (data.get("comment_value_judge") or {}).get("items") or []
            if not isinstance(citems, list):
                citems = []

            tags: List[str] = []
            for it in citems:
                if not isinstance(it, dict):
                    continue
                ts = it.get("tags") or []
                if isinstance(ts, list):
                    for t in ts:
                        if isinstance(t, str) and t:
                            tags.append(t)

            for t in tags:
                tag_counts[t] = tag_counts.get(t, 0) + 1

            report_candidates = list(self.run_dir.glob(f"mvp_report_*_{aweme_id}.md")) if aweme_id else []
            report_file = report_candidates[0].name if report_candidates else ""

            ci = data.get("community_insights") or {}
            consensus = ci.get("consensus") or []
            controversy = ci.get("controversy") or []
            if isinstance(consensus, list):
                for x in consensus[:3]:
                    if isinstance(x, str) and x:
                        community_bag.append(("consensus", x))
            if isinstance(controversy, list):
                for x in controversy[:3]:
                    if isinstance(x, str) and x:
                        community_bag.append(("controversy", x))

            ocr_summary = data.get("ocr_summary") or {}
            ocr_key_texts = ocr_summary.get("key_texts") if isinstance(ocr_summary, dict) else None
            if not isinstance(ocr_key_texts, list):
                ocr_key_texts = []

            row = {
                "aweme_id": aweme_id,
                "video_url": video_url,
                "source_keyword": source_keyword,
                "knowledge_points": knowledge_points,
                "tags": tags,
                "comments_summary": {
                    "consensus": consensus[:3] if isinstance(consensus, list) else [],
                    "controversy": controversy[:3] if isinstance(controversy, list) else [],
                    "tags": tags[:10],
                },
                "ocr_summary": {
                    "total_blocks": (ocr_summary.get("total_blocks") if isinstance(ocr_summary, dict) else None),
                    "key_texts": ocr_key_texts[:10],
                    "source_distribution": (ocr_summary.get("source_distribution") if isinstance(ocr_summary, dict) else None),
                },
                "analysis_file": f.name,
                "report_file": report_file,
            }
            index_rows.append(row)

            for kp in knowledge_points:
                if not isinstance(kp, dict):
                    continue
                title = str(kp.get("title") or "").strip()
                content = str(kp.get("content") or "").strip()
                timestamp = str(kp.get("timestamp") or "").strip()
                if title or content:
                    knowledge_bag.append((title, content, timestamp))

        kb_index_path = self.run_dir / f"kb_index_{self.run_id}.jsonl"
        kb_tags_path = self.run_dir / f"kb_tags_{self.run_id}.json"
        kb_summary_path = self.run_dir / f"kb_summary_{self.run_id}.md"

        self._write_jsonl(kb_index_path, index_rows)
        self._write_json(kb_tags_path, tag_counts)

        md = self._build_fallback_summary(index_rows=index_rows, tag_counts=tag_counts, knowledge_bag=knowledge_bag)
        self._write_md(kb_summary_path, md)

    def _build_fallback_summary(
        self,
        *,
        index_rows: List[Dict[str, Any]],
        tag_counts: Dict[str, int],
        knowledge_bag: List[Tuple[str, str, str]],
    ) -> str:
        uniq: Dict[str, Tuple[str, str]] = {}
        for title, content, ts in knowledge_bag:
            key = title or content
            if key not in uniq:
                uniq[key] = (ts, content)

        lines: List[str] = []
        lines.append("# 知识库总结（规则降级）")
        lines.append("")
        lines.append("## 视频索引")
        if index_rows:
            for row in index_rows:
                lines.append(f"- {row.get('aweme_id','')}: {row.get('video_url','')}")
        else:
            lines.append("- （无）")
        lines.append("")
        lines.append("## 聚合知识点（去重）")
        if uniq:
            for k, (ts, content) in list(uniq.items())[:20]:
                prefix = f"{ts} " if ts else ""
                lines.append(f"- {prefix}{k}".strip())
                if content and content != k:
                    lines.append(f"  - {content}")
        else:
            lines.append("- （无）")
        lines.append("")
        lines.append("## 标签统计")
        filtered = {k: v for k, v in tag_counts.items() if v >= 2}
        if filtered:
            for k, v in sorted(filtered.items(), key=lambda x: x[1], reverse=True):
                lines.append(f"- {k}: {v}")
        else:
            lines.append("- （无）")
        lines.append("")

        lines.append("## 社区反馈（跨视频）")
        consensus_set = set()
        controversy_set = set()
        for row in index_rows:
            cs = (row.get("comments_summary") or {}).get("consensus") or []
            if isinstance(cs, list):
                for x in cs:
                    if isinstance(x, str) and x:
                        consensus_set.add(x)
            cv = (row.get("comments_summary") or {}).get("controversy") or []
            if isinstance(cv, list):
                for x in cv:
                    if isinstance(x, str) and x:
                        controversy_set.add(x)

        lines.append("### 共识")
        if consensus_set:
            for x in list(consensus_set)[:20]:
                lines.append(f"- {x}")
        else:
            lines.append("- （无）")

        lines.append("### 争议")
        if controversy_set:
            for x in list(controversy_set)[:20]:
                lines.append(f"- {x}")
        else:
            lines.append("- （无）")
        lines.append("")

        lines.append("## 画面文字（跨视频）")
        ocr_texts = set()
        for row in index_rows:
            ks = (row.get("ocr_summary") or {}).get("key_texts") or []
            if isinstance(ks, list):
                for x in ks:
                    if isinstance(x, str) and x:
                        ocr_texts.add(x)
        if ocr_texts:
            for x in list(ocr_texts)[:30]:
                lines.append(f"- {x}")
        else:
            lines.append("- （无）")
        lines.append("")

        return "\n".join(lines)
