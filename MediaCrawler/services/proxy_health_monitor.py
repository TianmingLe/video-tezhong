# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class ProxyHealthRecord:
    success_count: int = 0
    failure_count: int = 0
    last_used: Optional[float] = None
    total_response_time_ms: float = 0.0
    response_time_count: int = 0
    banned: bool = False
    ban_reason: Optional[str] = None
    consecutive_failures: int = 0

    @property
    def average_response_time(self) -> float:
        if self.response_time_count == 0:
            return 0.0
        return self.total_response_time_ms / self.response_time_count


class ProxyHealthMonitor:
    BAN_PATTERNS = {
        "connection_refused",
        "connection_reset",
        "proxy_banned",
        "blocked",
        "forbidden",
        "access_denied",
        "rate_limited",
    }
    BAN_CONSECUTIVE_FAILURES = 5
    BAN_FAILURE_RATIO = 0.8

    def __init__(self) -> None:
        self._records: Dict[str, ProxyHealthRecord] = {}

    def _get_record(self, proxy_ip: str) -> ProxyHealthRecord:
        if proxy_ip not in self._records:
            self._records[proxy_ip] = ProxyHealthRecord()
        return self._records[proxy_ip]

    def record_success(self, proxy_ip: str, response_time_ms: float) -> None:
        record = self._get_record(proxy_ip)
        record.success_count += 1
        record.last_used = time.time()
        record.total_response_time_ms += response_time_ms
        record.response_time_count += 1
        record.consecutive_failures = 0

    def record_failure(self, proxy_ip: str, error_type: str) -> None:
        record = self._get_record(proxy_ip)
        record.failure_count += 1
        record.last_used = time.time()
        record.consecutive_failures += 1

        if self._is_ban_error(error_type):
            record.banned = True
            record.ban_reason = error_type
            return

        total = record.success_count + record.failure_count
        if total >= 5 and record.failure_count / total >= self.BAN_FAILURE_RATIO:
            record.banned = True
            record.ban_reason = "high_failure_ratio"
            return

        if record.consecutive_failures >= self.BAN_CONSECUTIVE_FAILURES:
            record.banned = True
            record.ban_reason = "consecutive_failures"

    def _is_ban_error(self, error_type: str) -> bool:
        return error_type.lower() in self.BAN_PATTERNS

    def get_proxy_score(self, proxy_ip: str) -> float:
        record = self._get_record(proxy_ip)
        if record.banned:
            return 0.0

        total = record.success_count + record.failure_count
        if total == 0:
            return 0.5

        success_rate = record.success_count / total
        response_time_penalty = min(record.average_response_time / 5000.0, 0.3)
        recency_bonus = 0.0
        if record.last_used is not None:
            elapsed = time.time() - record.last_used
            if elapsed < 60:
                recency_bonus = 0.1

        score = success_rate * 0.7 + 0.3 - response_time_penalty + recency_bonus
        return max(0.0, min(1.0, score))

    def get_health_report(self) -> Dict:
        total_proxies = len(self._records)
        if total_proxies == 0:
            return {
                "total_proxies": 0,
                "banned_count": 0,
                "healthy_count": 0,
                "overall_success_rate": 0.0,
                "average_response_time_ms": 0.0,
            }

        total_success = sum(r.success_count for r in self._records.values())
        total_failure = sum(r.failure_count for r in self._records.values())
        total_requests = total_success + total_failure

        overall_success_rate = total_success / total_requests if total_requests > 0 else 0.0
        avg_response_time = (
            sum(r.average_response_time for r in self._records.values()) / total_proxies
        )
        banned_count = sum(1 for r in self._records.values() if r.banned)

        return {
            "total_proxies": total_proxies,
            "banned_count": banned_count,
            "healthy_count": total_proxies - banned_count,
            "overall_success_rate": round(overall_success_rate, 4),
            "average_response_time_ms": round(avg_response_time, 2),
        }

    def get_banned_proxies(self) -> List[str]:
        return [ip for ip, r in self._records.items() if r.banned]

    def recommend_proxy(self, proxy_list: List[str]) -> Optional[str]:
        available = [ip for ip in proxy_list if not self._get_record(ip).banned]
        if not available:
            return None
        return max(available, key=lambda ip: self.get_proxy_score(ip))
