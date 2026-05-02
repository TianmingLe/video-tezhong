import asyncio
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class LLMResult:
    text: str
    usage: Dict[str, int]
    cost_usd: Optional[float]


class LLMClient:
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
    ) -> LLMResult:
        """
        统一 LLM 调用入口（OpenAI 兼容协议），底层使用 LiteLLM。

        设计目标：
        - 与具体模型/厂商解耦：用户只需提供 model + base_url + api_key
        - 与 asyncio 架构兼容：用 asyncio.to_thread 包装阻塞调用
        - 输出标准化：返回 text + token usage + cost（若可获得）
        """

        def _blocking_call() -> Any:
            import litellm  # type: ignore

            return litellm.completion(
                model=model,
                messages=messages,
                api_base=api_base,
                api_key=api_key,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout_s,
            )

        resp = await asyncio.to_thread(_blocking_call)

        text = resp.choices[0].message["content"]
        usage = getattr(resp, "usage", None) or {}

        hidden = getattr(resp, "_hidden_params", None) or {}
        cost = hidden.get("response_cost")

        return LLMResult(text=text, usage=usage, cost_usd=cost)

