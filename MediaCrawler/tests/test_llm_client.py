import asyncio
import sys
from types import SimpleNamespace


class _FakeResp:
    def __init__(self):
        self.choices = [SimpleNamespace(message={"content": "ok"})]
        self.usage = {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
        self._hidden_params = {"response_cost": 0.001}


def test_llm_client_returns_text_and_usage(monkeypatch):
    fake_litellm = SimpleNamespace(
        completion=lambda **kwargs: _FakeResp(),
    )
    monkeypatch.setitem(sys.modules, "litellm", fake_litellm)

    from services.llm_client import LLMClient

    client = LLMClient()
    res = asyncio.run(
        client.chat(
            model="any",
            api_base="http://x/v1",
            api_key="k",
            messages=[{"role": "user", "content": "hi"}],
            temperature=0.2,
            max_tokens=100,
            timeout_s=5,
        )
    )
    assert res.text == "ok"
    assert res.usage["total_tokens"] == 15
    assert res.cost_usd == 0.001

