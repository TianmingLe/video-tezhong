import asyncio

from services.llm_client import LLMResult
from services.llm_prompts import PromptStore, PromptTemplate


class _FakeClient:
    def __init__(self):
        self.calls = 0

    async def chat(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            return LLMResult(
                text='[{"comment_text":"a","is_valuable":true,"tags":["#t"],"reason":"r"}]',
                usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
                cost_usd=0.001,
            )
        return LLMResult(
            text='[{"title":"k","content":"c","timestamp":"00:00:01.000"}]',
            usage={"prompt_tokens": 4, "completion_tokens": 3, "total_tokens": 7},
            cost_usd=0.002,
        )


def test_analyzer_parses_outputs():
    store = PromptStore(
        {
            "comment_value_judge": PromptTemplate(system="s", user="{video_topic}{comments_json}"),
            "knowledge_extract": PromptTemplate(system="s", user="{transcript}{ocr_text}"),
        }
    )

    from services.llm_analyzer import LLMAnalyzer

    analyzer = LLMAnalyzer(prompt_store=store, llm_client=_FakeClient(), cache=None)
    out = asyncio.run(
        analyzer.analyze(
            model="m",
            api_base="b",
            api_key="k",
            video_topic="t",
            transcript="x",
            comments=[{"text": "a", "like_count": 1}],
            ocr_text="",
        )
    )

    assert out["status"] == "success"
    assert out["comment_value_judge"]["items"][0]["is_valuable"] is True
    assert out["knowledge_points"][0]["title"] == "k"
    assert out["usage"]["total_tokens"] == 12
    assert out["usage"]["cost_usd"] == 0.003

