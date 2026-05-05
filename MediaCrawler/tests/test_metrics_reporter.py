# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1

import json
import os
import tempfile
from pathlib import Path

import pytest

from services.metrics_reporter import MetricsReporter


class TestMetricsReporter:
    def test_record_request_accumulates(self):
        reporter = MetricsReporter(output_path="/tmp/test_metrics.json")
        reporter.record_request("xhs", True, 200.0, "1.1.1.1")
        reporter.record_request("xhs", True, 300.0, "1.1.1.1")
        reporter.record_request("xhs", False, 100.0, "1.1.1.1", "timeout")

        summary = reporter.get_summary()
        assert summary["total_request_count"] == 3
        assert summary["platforms"]["xhs"]["request_count"] == 3
        assert abs(summary["platforms"]["xhs"]["success_rate"] - 2 / 3) < 0.001
        assert summary["platforms"]["xhs"]["average_response_time_ms"] == 200.0
        assert summary["proxies"]["1.1.1.1"]["request_count"] == 3
        assert abs(summary["proxies"]["1.1.1.1"]["success_rate"] - 2 / 3) < 0.001
        assert summary["error_type_distribution"]["timeout"] == 1

    def test_multiple_platforms(self):
        reporter = MetricsReporter(output_path="/tmp/test_metrics.json")
        reporter.record_request("xhs", True, 100.0)
        reporter.record_request("dy", True, 200.0)
        reporter.record_request("dy", False, 50.0, error_type="blocked")

        summary = reporter.get_summary()
        assert set(summary["platforms"].keys()) == {"xhs", "dy"}
        assert summary["platforms"]["xhs"]["request_count"] == 1
        assert summary["platforms"]["dy"]["request_count"] == 2
        assert abs(summary["overall_success_rate"] - 2 / 3) < 0.001

    def test_json_output_format(self):
        reporter = MetricsReporter(output_path="/tmp/test_metrics.json")
        reporter.record_request("xhs", True, 150.0, "2.2.2.2")
        json_str = reporter.to_json()
        parsed = json.loads(json_str)
        assert "total_request_count" in parsed
        assert "overall_success_rate" in parsed
        assert "platforms" in parsed
        assert "proxies" in parsed
        assert "error_type_distribution" in parsed
        assert parsed["platforms"]["xhs"]["average_response_time_ms"] == 150.0

    def test_save_creates_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "metrics.json")
            reporter = MetricsReporter(output_path=path)
            reporter.record_request("xhs", True, 100.0)
            reporter.save()
            assert os.path.exists(path)
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            assert data["total_request_count"] == 1

    def test_reset_clears_data(self):
        reporter = MetricsReporter(output_path="/tmp/test_metrics.json")
        reporter.record_request("xhs", True, 100.0)
        reporter.reset()
        summary = reporter.get_summary()
        assert summary["total_request_count"] == 0
        assert summary["platforms"] == {}
        assert summary["proxies"] == {}
        assert summary["error_type_distribution"] == {}

    def test_empty_summary(self):
        reporter = MetricsReporter(output_path="/tmp/test_metrics.json")
        summary = reporter.get_summary()
        assert summary["total_request_count"] == 0
        assert summary["overall_success_rate"] == 0.0
        assert summary["platforms"] == {}
        assert summary["proxies"] == {}
        assert summary["error_type_distribution"] == {}

    def test_platform_aggregation(self):
        reporter = MetricsReporter(output_path="/tmp/test_metrics.json")
        reporter.record_request("xhs", True, 100.0)
        reporter.record_request("xhs", True, 200.0)
        reporter.record_request("xhs", False, 300.0, error_type="timeout")
        reporter.record_request("dy", True, 50.0)
        reporter.record_request("dy", False, 150.0, error_type="blocked")
        reporter.record_request("dy", False, 250.0, error_type="blocked")

        summary = reporter.get_summary()
        assert summary["total_request_count"] == 6
        assert summary["platforms"]["xhs"]["request_count"] == 3
        assert abs(summary["platforms"]["xhs"]["success_rate"] - 2 / 3) < 0.001
        assert summary["platforms"]["xhs"]["average_response_time_ms"] == 200.0
        assert summary["platforms"]["dy"]["request_count"] == 3
        assert abs(summary["platforms"]["dy"]["success_rate"] - 1 / 3) < 0.001
        assert summary["platforms"]["dy"]["average_response_time_ms"] == 150.0
        assert summary["error_type_distribution"]["timeout"] == 1
        assert summary["error_type_distribution"]["blocked"] == 2
