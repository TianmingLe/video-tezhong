import json
from typing import Any, Dict, List


class CommentProcessor:
    def build(
        self,
        *,
        raw_comments: List[Dict[str, Any]],
        top_comments: int,
        top_replies: int,
        budget_chars: int,
    ) -> Dict[str, Any]:
        if top_comments < 0:
            top_comments = 0
        if top_replies < 0:
            top_replies = 0
        if budget_chars <= 0:
            budget_chars = 1

        by_parent: Dict[str, List[Dict[str, Any]]] = {}
        roots: List[Dict[str, Any]] = []

        for c in raw_comments:
            parent = str(c.get("parent_comment_id") or "0")
            if parent == "0":
                roots.append(c)
            by_parent.setdefault(parent, []).append(c)

        roots.sort(key=lambda x: int(x.get("like_count") or 0), reverse=True)
        if top_comments:
            roots = roots[:top_comments]

        root_items: List[Dict[str, Any]] = []
        total_replies = 0
        for r in roots:
            cid = str(r.get("comment_id") or "")
            replies = [x for x in by_parent.get(cid, []) if str(x.get("comment_id") or "") != cid]
            replies = [x for x in replies if str(x.get("parent_comment_id") or "") != "0"]
            replies.sort(key=lambda x: int(x.get("like_count") or 0), reverse=True)
            if top_replies:
                replies = replies[:top_replies]
            total_replies += len(replies)

            root_items.append(
                {
                    "content": str(r.get("content") or ""),
                    "like_count": int(r.get("like_count") or 0),
                    "author": str(r.get("nickname") or ""),
                    "replies": [
                        {
                            "content": str(s.get("content") or ""),
                            "like_count": int(s.get("like_count") or 0),
                            "author": str(s.get("nickname") or ""),
                        }
                        for s in replies
                    ],
                }
            )

        top_like = 0
        if root_items:
            top_like = max([int(x.get("like_count") or 0) for x in root_items] or [0])

        out: Dict[str, Any] = {
            "root_comments": root_items,
            "stats": {
                "total_comments": len(raw_comments),
                "total_root_comments": len(root_items),
                "total_replies": total_replies,
                "top_comment_likes": top_like,
                "truncated": False,
            },
        }

        if len(json.dumps(out, ensure_ascii=False)) <= budget_chars:
            return out

        out = self._truncate_to_budget(out=out, budget_chars=budget_chars)
        return out

    def _truncate_to_budget(self, *, out: Dict[str, Any], budget_chars: int) -> Dict[str, Any]:
        roots: List[Dict[str, Any]] = list(out.get("root_comments") or [])

        def size() -> int:
            return len(json.dumps(out, ensure_ascii=False))

        if size() <= budget_chars:
            return out

        while roots and size() > budget_chars:
            roots.pop()
            out["root_comments"] = roots
            out["stats"]["total_root_comments"] = len(roots)

        if size() <= budget_chars:
            out["stats"]["truncated"] = True
            return out

        for r in roots:
            replies = r.get("replies") or []
            if not isinstance(replies, list):
                continue
            while replies and size() > budget_chars:
                replies.pop()
                r["replies"] = replies

        if size() <= budget_chars:
            out["stats"]["truncated"] = True
            return out

        for r in roots:
            if size() <= budget_chars:
                break
            r["content"] = self._cut_text(str(r.get("content") or ""), max_len=200)
            replies = r.get("replies") or []
            if isinstance(replies, list):
                for s in replies:
                    if size() <= budget_chars:
                        break
                    s["content"] = self._cut_text(str(s.get("content") or ""), max_len=120)

        if size() > budget_chars and roots:
            for r in roots:
                if size() <= budget_chars:
                    break
                r["content"] = self._cut_text(str(r.get("content") or ""), max_len=60)
                replies = r.get("replies") or []
                if isinstance(replies, list):
                    for s in replies:
                        if size() <= budget_chars:
                            break
                        s["content"] = self._cut_text(str(s.get("content") or ""), max_len=40)

        out["stats"]["truncated"] = True
        return out

    def _cut_text(self, text: str, *, max_len: int) -> str:
        if len(text) <= max_len:
            return text
        return text[:max_len]

