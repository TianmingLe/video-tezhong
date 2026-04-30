import time

from services.llm_cache import LLMCache


def test_llm_cache_ttl(monkeypatch):
    t = [1000.0]
    monkeypatch.setattr(time, "time", lambda: t[0])

    cache = LLMCache(ttl_seconds=10)
    cache.set("k", {"x": 1})
    assert cache.get("k") == {"x": 1}

    t[0] = 1011.0
    assert cache.get("k") is None

