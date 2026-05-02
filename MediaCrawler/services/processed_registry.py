import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Set


@dataclass(frozen=True)
class ProcessedRecord:
    aweme_id: str
    status: str
    failed_stage: Optional[str]
    error_code: Optional[str]
    timestamp: str


class ProcessedRegistry:
    def __init__(self, *, path: Path):
        self.path = path
        self._processed_success: Set[str] = set()
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            for ln in self.path.read_text(encoding="utf-8").splitlines():
                ln = ln.strip()
                if not ln:
                    continue
                obj = json.loads(ln)
                if not isinstance(obj, dict):
                    continue
                if obj.get("status") == "success" and obj.get("aweme_id"):
                    self._processed_success.add(str(obj.get("aweme_id")))
        except Exception:
            return

    def is_processed(self, aweme_id: str) -> bool:
        return aweme_id in self._processed_success

    def _append(self, record: Dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def append_success(self, aweme_id: str, *, extra: Optional[Dict[str, Any]] = None) -> None:
        ts = datetime.now(timezone.utc).isoformat()
        payload: Dict[str, Any] = {
            "aweme_id": aweme_id,
            "status": "success",
            "timestamp": ts,
        }
        if extra:
            payload.update(extra)
        self._append(
            payload
        )
        self._processed_success.add(aweme_id)

    def append_failed(
        self, *, aweme_id: str, failed_stage: str, error_code: str, extra: Optional[Dict[str, Any]] = None
    ) -> None:
        ts = datetime.now(timezone.utc).isoformat()
        payload: Dict[str, Any] = {
            "aweme_id": aweme_id,
            "status": "failed",
            "failed_stage": failed_stage,
            "error_code": error_code,
            "timestamp": ts,
        }
        if extra:
            payload.update(extra)
        self._append(payload)
