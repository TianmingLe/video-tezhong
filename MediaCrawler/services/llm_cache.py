import time
from typing import Any, Dict, Optional, Tuple


class LLMCache:
    """
    简单 TTL 内存缓存：满足“相同输入 30 分钟内不重复调用 LLM”的需求。

    说明：
    - Phase 2 先实现 memory 版，保证无外部依赖
    - 后续如需跨进程/跨机器复用，可扩展为 Redis（与现有 cache/RedisCache 对齐）
    """

    def __init__(self, *, ttl_seconds: int):
        self._ttl = ttl_seconds
        self._store: Dict[str, Tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        v = self._store.get(key)
        if not v:
            return None

        value, exp = v
        if exp < time.time():
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (value, time.time() + self._ttl)

