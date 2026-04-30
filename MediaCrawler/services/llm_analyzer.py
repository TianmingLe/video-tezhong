import hashlib
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol

from services.llm_cache import LLMCache
from services.llm_client import LLMClient, LLMResult
from services.llm_prompts import PromptStore


class LLMClientLike(Protocol):
    async def chat(
        self,
        *,
        model: str,
        api_base: str,
        api_key: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        timeout_s: int,
    ) -> LLMResult: ...


@dataclass(frozen=True)
class LLMRuntimeConfig:
    temperature: float = 0.2
    max_tokens: int = 1200
    timeout_s: int = 60


class LLMAnalyzer:
    def __init__(
        self,
        *,
        prompt_store: PromptStore,
        llm_client: Optional[LLMClientLike] = None,
        cache: Optional[LLMCache] = None,
        runtime: Optional[LLMRuntimeConfig] = None,
    ) -> None:
        self.prompt_store = prompt_store
        self.llm_client = llm_client or LLMClient()
        self.cache = cache
        self.runtime = runtime or LLMRuntimeConfig()

    def _cache_key(self, *, model: str, prompt_name: str, user_text: str) -> str:
        raw = f"{model}|{prompt_name}|{user_text}".encode("utf-8", errors="ignore")
        return hashlib.sha256(raw).hexdigest()

    async def _call_json(
        self,
        *,
        model: str,
        api_base: str,
        api_key: str,
        prompt_name: str,
        system_text: str,
        user_text: str,
    ) -> Dict[str, Any]:
        key = self._cache_key(model=model, prompt_name=prompt_name, user_text=user_text)
        if self.cache:
            cached = self.cache.get(key)
            if cached is not None:
                return {
                    "cached": True,
                    "text": cached.get("text", ""),
                    "parsed": cached.get("parsed"),
                    "usage": cached.get("usage") or {},
                    "cost_usd": cached.get("cost_usd"),
                    "parse_error": cached.get("parse_error"),
                }

        messages = [
            {"role": "system", "content": system_text},
            {"role": "user", "content": user_text},
        ]
        resp = await self.llm_client.chat(
            model=model,
            api_base=api_base,
            api_key=api_key,
            messages=messages,
            temperature=self.runtime.temperature,
            max_tokens=self.runtime.max_tokens,
            timeout_s=self.runtime.timeout_s,
        )

        parsed = None
        parse_error = None
        try:
            parsed = json.loads(resp.text)
        except Exception as e:
            parse_error = str(e)
            parsed = []

        payload = {
            "cached": False,
            "text": resp.text,
            "parsed": parsed,
            "usage": resp.usage,
            "cost_usd": resp.cost_usd,
            "parse_error": parse_error,
        }

        if self.cache:
            self.cache.set(key, payload)

        return payload

    async def analyze(
        self,
        *,
        model: str,
        api_base: str,
        api_key: str,
        video_topic: str,
        transcript: str,
        comments: List[Dict[str, Any]],
        ocr_text: str,
    ) -> Dict[str, Any]:
        """
        Phase 2（LLM 分析）：
        - 评论价值判定：comment_value_judge
        - 知识点提取：knowledge_extract

        输出：
        - 结构化分析结果（供 analysis_pipeline 写入 mvp_analysis.json 与生成报告）
        - 统计 token/cost（若可获得）
        """

        total_prompt = 0
        total_completion = 0
        total_tokens = 0
        total_cost = 0.0

        cv_tpl = self.prompt_store.get("comment_value_judge")
        comments_json = json.dumps(comments, ensure_ascii=False)
        cv_user = cv_tpl.user.format(video_topic=video_topic, comments_json=comments_json)
        cv = await self._call_json(
            model=model,
            api_base=api_base,
            api_key=api_key,
            prompt_name="comment_value_judge",
            system_text=cv_tpl.system,
            user_text=cv_user,
        )

        ke_tpl = self.prompt_store.get("knowledge_extract")
        ke_user = ke_tpl.user.format(transcript=transcript, ocr_text=ocr_text)
        ke = await self._call_json(
            model=model,
            api_base=api_base,
            api_key=api_key,
            prompt_name="knowledge_extract",
            system_text=ke_tpl.system,
            user_text=ke_user,
        )

        for part in (cv, ke):
            usage = part.get("usage") or {}
            total_prompt += int(usage.get("prompt_tokens") or 0)
            total_completion += int(usage.get("completion_tokens") or 0)
            total_tokens += int(usage.get("total_tokens") or 0)
            c = part.get("cost_usd")
            if isinstance(c, (int, float)):
                total_cost += float(c)

        comment_items = cv.get("parsed")
        if not isinstance(comment_items, list):
            comment_items = []

        knowledge_points = ke.get("parsed")
        if not isinstance(knowledge_points, list):
            knowledge_points = []

        return {
            "status": "success",
            "usage": {
                "prompt_tokens": total_prompt,
                "completion_tokens": total_completion,
                "total_tokens": total_tokens,
                "cost_usd": round(total_cost, 6),
            },
            "comment_value_judge": {
                "missing_comments": len(comments) == 0,
                "items": comment_items,
                "parse_error": cv.get("parse_error"),
                "cached": cv.get("cached"),
            },
            "knowledge_points": knowledge_points,
            "knowledge_points_parse_error": ke.get("parse_error"),
            "knowledge_points_cached": ke.get("cached"),
            "suggestions": [],
        }

