# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1

import time

import pytest

from services.proxy_health_monitor import ProxyHealthMonitor


class TestProxyHealthMonitor:
    def test_record_success_updates_stats(self):
        monitor = ProxyHealthMonitor()
        monitor.record_success("1.1.1.1", 200.0)
        record = monitor._get_record("1.1.1.1")
        assert record.success_count == 1
        assert record.failure_count == 0
        assert record.average_response_time == 200.0
        assert record.last_used is not None

    def test_record_failure_updates_stats(self):
        monitor = ProxyHealthMonitor()
        monitor.record_failure("1.1.1.1", "timeout")
        record = monitor._get_record("1.1.1.1")
        assert record.failure_count == 1
        assert record.success_count == 0
        assert record.consecutive_failures == 1

    def test_score_for_new_proxy(self):
        monitor = ProxyHealthMonitor()
        score = monitor.get_proxy_score("1.1.1.1")
        assert score == 0.5

    def test_score_after_success(self):
        monitor = ProxyHealthMonitor()
        monitor.record_success("1.1.1.1", 100.0)
        score = monitor.get_proxy_score("1.1.1.1")
        assert score > 0.5

    def test_score_after_failure(self):
        monitor = ProxyHealthMonitor()
        monitor.record_failure("1.1.1.1", "timeout")
        score = monitor.get_proxy_score("1.1.1.1")
        assert score < 0.5

    def test_banned_proxy_score_is_zero(self):
        monitor = ProxyHealthMonitor()
        monitor.record_failure("1.1.1.1", "proxy_banned")
        score = monitor.get_proxy_score("1.1.1.1")
        assert score == 0.0

    def test_ban_detection_by_pattern(self):
        monitor = ProxyHealthMonitor()
        for pattern in ["blocked", "forbidden", "rate_limited"]:
            monitor.record_failure("1.1.1.1", pattern)
            assert monitor._get_record("1.1.1.1").banned is True
            monitor._records.clear()

    def test_ban_detection_by_consecutive_failures(self):
        monitor = ProxyHealthMonitor()
        for _ in range(5):
            monitor.record_failure("1.1.1.1", "timeout")
        assert monitor._get_record("1.1.1.1").banned is True
        assert monitor._get_record("1.1.1.1").ban_reason in (
            "consecutive_failures",
            "high_failure_ratio",
        )

    def test_ban_detection_by_high_failure_ratio(self):
        monitor = ProxyHealthMonitor()
        monitor.record_success("1.1.1.1", 100.0)
        for _ in range(4):
            monitor.record_failure("1.1.1.1", "timeout")
        assert monitor._get_record("1.1.1.1").banned is True
        assert monitor._get_record("1.1.1.1").ban_reason == "high_failure_ratio"

    def test_get_banned_proxies(self):
        monitor = ProxyHealthMonitor()
        monitor.record_failure("1.1.1.1", "blocked")
        monitor.record_failure("2.2.2.2", "timeout")
        banned = monitor.get_banned_proxies()
        assert "1.1.1.1" in banned
        assert "2.2.2.2" not in banned

    def test_recommend_proxy_prefers_higher_score(self):
        monitor = ProxyHealthMonitor()
        monitor.record_success("1.1.1.1", 100.0)
        monitor.record_success("1.1.1.1", 100.0)
        monitor.record_success("2.2.2.2", 100.0)
        recommended = monitor.recommend_proxy(["1.1.1.1", "2.2.2.2"])
        assert recommended == "1.1.1.1"

    def test_recommend_proxy_skips_banned(self):
        monitor = ProxyHealthMonitor()
        monitor.record_failure("1.1.1.1", "blocked")
        monitor.record_success("2.2.2.2", 100.0)
        recommended = monitor.recommend_proxy(["1.1.1.1", "2.2.2.2"])
        assert recommended == "2.2.2.2"

    def test_recommend_proxy_returns_none_when_all_banned(self):
        monitor = ProxyHealthMonitor()
        monitor.record_failure("1.1.1.1", "blocked")
        monitor.record_failure("2.2.2.2", "blocked")
        recommended = monitor.recommend_proxy(["1.1.1.1", "2.2.2.2"])
        assert recommended is None

    def test_health_report_empty(self):
        monitor = ProxyHealthMonitor()
        report = monitor.get_health_report()
        assert report == {
            "total_proxies": 0,
            "banned_count": 0,
            "healthy_count": 0,
            "overall_success_rate": 0.0,
            "average_response_time_ms": 0.0,
        }

    def test_health_report_with_data(self):
        monitor = ProxyHealthMonitor()
        monitor.record_success("1.1.1.1", 200.0)
        monitor.record_success("1.1.1.1", 300.0)
        monitor.record_failure("2.2.2.2", "timeout")
        report = monitor.get_health_report()
        assert report["total_proxies"] == 2
        assert report["banned_count"] == 0
        assert report["healthy_count"] == 2
        assert abs(report["overall_success_rate"] - 2 / 3) < 0.001
        assert report["average_response_time_ms"] == 125.0

    def test_recency_bonus(self):
        monitor = ProxyHealthMonitor()
        monitor.record_success("1.1.1.1", 100.0)
        score_immediate = monitor.get_proxy_score("1.1.1.1")
        record = monitor._get_record("1.1.1.1")
        record.last_used = time.time() - 120
        score_old = monitor.get_proxy_score("1.1.1.1")
        assert score_immediate > score_old

    def test_response_time_penalty(self):
        monitor = ProxyHealthMonitor()
        monitor.record_success("1.1.1.1", 100.0)
        score_fast = monitor.get_proxy_score("1.1.1.1")
        monitor.record_success("2.2.2.2", 6000.0)
        score_slow = monitor.get_proxy_score("2.2.2.2")
        assert score_fast > score_slow
