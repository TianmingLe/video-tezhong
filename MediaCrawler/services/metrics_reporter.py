# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import config


@dataclass
class PlatformMetrics:
    request_count: int = 0
    success_count: int = 0
    total_response_time_ms: float = 0.0
    response_time_count: int = 0

    @property
    def success_rate(self) -> float:
        if self.request_count == 0:
            return 0.0
        return self.success_count / self.request_count

    @property
    def average_response_time(self) -> float:
        if self.response_time_count == 0:
            return 0.0
        return self.total_response_time_ms / self.response_time_count


@dataclass
class ProxyMetrics:
    request_count: int = 0
    success_count: int = 0

    @property
    def success_rate(self) -> float:
        if self.request_count == 0:
            return 0.0
        return self.success_count / self.request_count


class MetricsReporter:
    def __init__(self, output_path: Optional[str] = None) -> None:
        self.platform_metrics: Dict[str, PlatformMetrics] = {}
        self.proxy_metrics: Dict[str, ProxyMetrics] = {}
        self.error_counts: Dict[str, int] = {}
        self.total_request_count: int = 0
        self.output_path = output_path or self._default_output_path()

    def _default_output_path(self) -> str:
        save_path = getattr(config, "SAVE_DATA_PATH", "")
        if save_path:
            base = Path(save_path)
        else:
            base = Path("results")
        base.mkdir(parents=True, exist_ok=True)
        return str(base / "metrics.json")

    def record_request(
        self,
        platform: str,
        success: bool,
        response_time_ms: float = 0.0,
        proxy_ip: Optional[str] = None,
        error_type: Optional[str] = None,
    ) -> None:
        self.total_request_count += 1

        if platform not in self.platform_metrics:
            self.platform_metrics[platform] = PlatformMetrics()
        pm = self.platform_metrics[platform]
        pm.request_count += 1
        if success:
            pm.success_count += 1
        pm.total_response_time_ms += response_time_ms
        pm.response_time_count += 1

        if proxy_ip:
            if proxy_ip not in self.proxy_metrics:
                self.proxy_metrics[proxy_ip] = ProxyMetrics()
            pxm = self.proxy_metrics[proxy_ip]
            pxm.request_count += 1
            if success:
                pxm.success_count += 1

        if not success and error_type:
            self.error_counts[error_type] = self.error_counts.get(error_type, 0) + 1

    def get_summary(self) -> Dict:
        platform_summary = {}
        for name, pm in self.platform_metrics.items():
            platform_summary[name] = {
                "request_count": pm.request_count,
                "success_rate": round(pm.success_rate, 4),
                "average_response_time_ms": round(pm.average_response_time, 2),
            }

        proxy_summary = {}
        for ip, pxm in self.proxy_metrics.items():
            proxy_summary[ip] = {
                "request_count": pxm.request_count,
                "success_rate": round(pxm.success_rate, 4),
            }

        total_success = sum(pm.success_count for pm in self.platform_metrics.values())
        overall_success_rate = total_success / self.total_request_count if self.total_request_count > 0 else 0.0

        return {
            "total_request_count": self.total_request_count,
            "overall_success_rate": round(overall_success_rate, 4),
            "platforms": platform_summary,
            "proxies": proxy_summary,
            "error_type_distribution": self.error_counts,
        }

    def to_json(self) -> str:
        return json.dumps(self.get_summary(), indent=2, ensure_ascii=False)

    def save(self) -> None:
        data = self.to_json()
        Path(self.output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(self.output_path, "w", encoding="utf-8") as f:
            f.write(data)

    def reset(self) -> None:
        self.platform_metrics.clear()
        self.proxy_metrics.clear()
        self.error_counts.clear()
        self.total_request_count = 0
