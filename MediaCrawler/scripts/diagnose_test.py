import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from diagnose import (
    MIN_FREE_BYTES,
    build_report,
    calculate_status,
    run_checks,
    _check_chrome,
    _check_disk_space,
    _check_ffmpeg,
    _check_llm_api_key,
    _check_network,
    _check_output_dir,
    _check_proxy,
    _check_python_version,
)


def test_check_python_version_ok():
    with patch.object(sys, "version_info", (3, 11, 2)):
        res = _check_python_version()
    assert res["name"] == "python_version"
    assert res["status"] == "ok"
    assert "3.11" in res["detail"]


def test_check_python_version_error():
    with patch.object(sys, "version_info", (3, 9, 0)):
        res = _check_python_version()
    assert res["status"] == "error"
    assert "suggestion" in res


def test_check_ffmpeg_not_found():
    with patch("shutil.which", return_value=None):
        res = _check_ffmpeg()
    assert res["status"] == "error"
    assert res["detail"] == "not found"


def test_check_ffmpeg_ok():
    with patch("shutil.which", return_value="/usr/bin/ffmpeg"):
        with patch(
            "subprocess.run",
            return_value=type("R", (), {"stdout": "ffmpeg version 5.0\n", "stderr": ""})(),
        ):
            res = _check_ffmpeg()
    assert res["status"] == "ok"
    assert "5.0" in res["detail"]


def test_check_chrome_not_found():
    with patch("os.path.isfile", return_value=False):
        with patch("shutil.which", return_value=None):
            res = _check_chrome()
    assert res["status"] == "error"
    assert res["detail"] == "not found"


def test_check_chrome_ok():
    with patch("os.path.isfile", return_value=True):
        res = _check_chrome()
    assert res["status"] == "ok"


def test_check_disk_space_error():
    with patch("shutil.disk_usage", return_value=type("U", (), {"free": MIN_FREE_BYTES - 1})()):
        res = _check_disk_space()
    assert res["status"] == "error"
    assert "suggestion" in res


def test_check_disk_space_ok():
    with patch("shutil.disk_usage", return_value=type("U", (), {"free": MIN_FREE_BYTES + 1})()):
        res = _check_disk_space()
    assert res["status"] == "ok"


def test_check_network_all_fail():
    with patch("socket.create_connection", side_effect=Exception("timeout")):
        res = _check_network()
    assert res["status"] == "error"
    assert "unreachable" in res["detail"]


def test_check_network_all_ok():
    with patch("socket.create_connection"):
        res = _check_network()
    assert res["status"] == "ok"


def test_check_proxy_ok_when_not_set():
    with patch.dict(os.environ, {}, clear=True):
        res = _check_proxy()
    assert res["status"] == "ok"
    assert res["detail"] == "not configured"


def test_check_proxy_error_bad_format():
    with patch.dict(os.environ, {"HTTP_PROXY": "bad"}, clear=True):
        res = _check_proxy()
    assert res["status"] == "error"
    assert "格式错误" in res["suggestion"]


def test_check_llm_api_key_warning():
    with patch.dict(os.environ, {}, clear=True):
        with patch.object(Path, "exists", return_value=False):
            res = _check_llm_api_key()
    assert res["status"] == "warning"


def test_check_llm_api_key_error_too_short():
    with patch.dict(os.environ, {"LLM_API_KEY": "abc"}, clear=True):
        res = _check_llm_api_key()
    assert res["status"] == "error"
    assert "too short" in res["detail"]


def test_check_llm_api_key_ok():
    with patch.dict(os.environ, {"LLM_API_KEY": "sk-1234567890abcdef"}, clear=True):
        res = _check_llm_api_key()
    assert res["status"] == "ok"
    assert "..." in res["detail"]


def test_check_output_dir_ok(tmp_path: Path):
    with patch.object(Path, "cwd", return_value=tmp_path):
        res = _check_output_dir()
    assert res["status"] == "ok"


def test_calculate_status_ok():
    assert calculate_status([{"status": "ok"}]) == "ok"


def test_calculate_status_warning():
    assert calculate_status([{"status": "ok"}, {"status": "warning"}]) == "warning"


def test_calculate_status_error():
    assert calculate_status([{"status": "ok"}, {"status": "warning"}, {"status": "error"}]) == "error"


def test_build_report_structure():
    with patch("diagnose.run_checks", return_value=[{"name": "a", "status": "ok", "detail": "x"}]):
        report = build_report()
    assert "overall_status" in report
    assert "checks" in report
    assert "summary" in report
    assert isinstance(report["checks"], list)


def test_json_output_format():
    report = build_report()
    dumped = json.dumps(report, ensure_ascii=False)
    parsed = json.loads(dumped)
    assert "overall_status" in parsed
    assert parsed["overall_status"] in ("ok", "warning", "error")
    for c in parsed["checks"]:
        assert "name" in c
        assert "status" in c
        assert c["status"] in ("ok", "warning", "error")
        assert "detail" in c


def test_run_checks_length():
    checks = run_checks()
    names = {c["name"] for c in checks}
    expected = {
        "python_version",
        "ffmpeg",
        "chrome",
        "disk_space",
        "network",
        "proxy",
        "llm_api_key",
        "output_dir",
    }
    assert names == expected
