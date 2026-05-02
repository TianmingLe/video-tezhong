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
                text='[{"comment_text":"a","is_valuable":true,"tags":["#t"],"reason":"r"},{"comment_text":"b","is_valuable":false,"tags":[],"reason":"x"}]',
                usage={"total_tokens": 5},
                cost_usd=0.0,
            )
        if self.calls == 2:
            return LLMResult(text='{"consensus":["c1"],"controversy":["v1"]}', usage={"total_tokens": 3}, cost_usd=0.0)
        return LLMResult(text='[{"title":"k","content":"c","timestamp":"00:00:01.000"}]', usage={"total_tokens": 7}, cost_usd=0.0)


def test_analyzer_comments_flow():
    store = PromptStore(
        {
            "comment_value_judge": PromptTemplate(system="s", user="{video_topic}{comments_json}"),
            "community_insights": PromptTemplate(system="s", user="{video_topic}{comments_json}"),
            "knowledge_extract": PromptTemplate(system="s", user="{transcript}{ocr_text}{valuable_comments_json}"),
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
            comments={"root_comments": [{"content": "a"}], "stats": {"total_comments": 1}},
            ocr_text="",
        )
    )

    assert out["community_insights"]["consensus"] == ["c1"]
    assert len(out["valuable_comments"]) == 1
    assert out["valuable_comments"][0]["comment_text"] == "a"

