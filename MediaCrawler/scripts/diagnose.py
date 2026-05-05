import json
import os
import platform
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any

MIN_PYTHON_MAJOR = 3
MIN_PYTHON_MINOR = 11
MIN_FREE_BYTES = 1 * 1024 * 1024 * 1024
TARGET_HOSTS = [
    ("douyin.com", 443),
    ("xiaohongshu.com", 443),
    ("bilibili.com", 443),
    ("weibo.com", 443),
    ("zhihu.com", 443),
]


def _check_python_version() -> dict[str, Any]:
    major, minor, micro, *_ = sys.version_info
    version = f"{major}.{minor}.{micro}"
    if (major, minor) >= (MIN_PYTHON_MAJOR, MIN_PYTHON_MINOR):
        return {"name": "python_version", "status": "ok", "detail": version}
    return {
        "name": "python_version",
        "status": "error",
        "detail": version,
        "suggestion": f"升级 Python 到 {MIN_PYTHON_MAJOR}.{MIN_PYTHON_MINOR}+",
    }


def _check_ffmpeg() -> dict[str, Any]:
    bin_name = "ffmpeg.exe" if platform.system() == "Windows" else "ffmpeg"
    path = shutil.which(bin_name)
    if not path:
        return {
            "name": "ffmpeg",
            "status": "error",
            "detail": "not found",
            "suggestion": "安装 FFmpeg 并添加到 PATH",
        }
    try:
        out = subprocess.run(
            [path, "-version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        first = out.stdout.splitlines()[0] if out.stdout else ""
        return {"name": "ffmpeg", "status": "ok", "detail": first.strip()}
    except Exception as exc:
        return {
            "name": "ffmpeg",
            "status": "warning",
            "detail": f"found but failed to run: {exc}",
            "suggestion": "检查 FFmpeg 可执行文件是否损坏",
        }


def _check_chrome() -> dict[str, Any]:
    system = platform.system()
    candidates: list[str] = []
    if system == "Windows":
        candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            "chrome.exe",
        ]
    elif system == "Darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
    else:
        candidates = [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "google-chrome",
            "chromium",
        ]

    for c in candidates:
        if c.endswith(".exe") or "/" in c or "\\" in c:
            if os.path.isfile(c):
                return {"name": "chrome", "status": "ok", "detail": c}
        else:
            path = shutil.which(c)
            if path:
                return {"name": "chrome", "status": "ok", "detail": path}

    return {
        "name": "chrome",
        "status": "error",
        "detail": "not found",
        "suggestion": "安装 Google Chrome 或 Chromium",
    }


def _check_disk_space() -> dict[str, Any]:
    cwd = Path.cwd()
    try:
        usage = shutil.disk_usage(str(cwd))
    except Exception as exc:
        return {
            "name": "disk_space",
            "status": "warning",
            "detail": f"unable to check: {exc}",
            "suggestion": "确保当前目录可访问",
        }
    free_gb = usage.free / (1024**3)
    if usage.free >= MIN_FREE_BYTES:
        return {
            "name": "disk_space",
            "status": "ok",
            "detail": f"{free_gb:.2f} GB free",
        }
    return {
        "name": "disk_space",
        "status": "error",
        "detail": f"{free_gb:.2f} GB free",
        "suggestion": "释放磁盘空间，至少保留 1GB",
    }


def _check_network() -> dict[str, Any]:
    results = []
    for host, port in TARGET_HOSTS:
        try:
            with socket.create_connection((host, port), timeout=5):
                results.append(f"{host}:ok")
        except Exception:
            results.append(f"{host}:fail")
    failed = [r for r in results if r.endswith(":fail")]
    if not failed:
        return {"name": "network", "status": "ok", "detail": "all reachable"}
    if len(failed) == len(TARGET_HOSTS):
        return {
            "name": "network",
            "status": "error",
            "detail": "all unreachable",
            "suggestion": "检查网络连接和 DNS 配置",
        }
    return {
        "name": "network",
        "status": "warning",
        "detail": ", ".join(results),
        "suggestion": "部分平台不可达，检查代理或防火墙",
    }


def _check_proxy() -> dict[str, Any]:
    proxy_vars = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]
    found = {k: os.environ.get(k) for k in proxy_vars if os.environ.get(k)}
    if not found:
        return {"name": "proxy", "status": "ok", "detail": "not configured"}
    details = ", ".join(f"{k}={v}" for k, v in found.items())
    for v in found.values():
        if not v.startswith(("http://", "https://", "socks5://")):
            return {
                "name": "proxy",
                "status": "error",
                "detail": details,
                "suggestion": "代理地址格式错误，应以 http:// 或 socks5:// 开头",
            }
    return {"name": "proxy", "status": "ok", "detail": details}


def _check_llm_api_key() -> dict[str, Any]:
    key = os.environ.get("LLM_API_KEY", "")
    if not key:
        config_path = Path("config/llm_config.yaml")
        if config_path.exists():
            try:
                text = config_path.read_text(encoding="utf-8")
                for line in text.splitlines():
                    if line.strip().startswith("api_key:"):
                        key = line.split(":", 1)[1].strip().strip('"').strip("'")
                        break
            except Exception:
                pass
    if not key:
        return {
            "name": "llm_api_key",
            "status": "warning",
            "detail": "not found",
            "suggestion": "在环境变量或 config/llm_config.yaml 中配置 LLM API Key",
        }
    if len(key) < 8:
        return {
            "name": "llm_api_key",
            "status": "error",
            "detail": "too short",
            "suggestion": "API Key 格式异常，请检查配置",
        }
    return {"name": "llm_api_key", "status": "ok", "detail": f"{key[:4]}...{key[-4:]}"}


def _check_output_dir() -> dict[str, Any]:
    out = Path("output")
    data = Path("data")
    for p in (out, data):
        try:
            p.mkdir(parents=True, exist_ok=True)
            test = p / ".write_test"
            test.write_text("ok")
            test.unlink()
        except Exception as exc:
            return {
                "name": "output_dir",
                "status": "error",
                "detail": f"{p}: {exc}",
                "suggestion": "检查目录权限或更换输出路径",
            }
    return {"name": "output_dir", "status": "ok", "detail": "output/ and data/ writable"}


def run_checks() -> list[dict[str, Any]]:
    return [
        _check_python_version(),
        _check_ffmpeg(),
        _check_chrome(),
        _check_disk_space(),
        _check_network(),
        _check_proxy(),
        _check_llm_api_key(),
        _check_output_dir(),
    ]


def calculate_status(checks: list[dict[str, Any]]) -> str:
    statuses = {c["status"] for c in checks}
    if "error" in statuses:
        return "error"
    if "warning" in statuses:
        return "warning"
    return "ok"


def build_report() -> dict[str, Any]:
    checks = run_checks()
    errors = sum(1 for c in checks if c["status"] == "error")
    warnings = sum(1 for c in checks if c["status"] == "warning")
    parts = []
    if errors:
        parts.append(f"{errors} error{'s' if errors > 1 else ''}")
    if warnings:
        parts.append(f"{warnings} warning{'s' if warnings > 1 else ''}")
    summary = ", ".join(parts) + " found" if parts else "all checks passed"
    return {
        "overall_status": calculate_status(checks),
        "checks": checks,
        "summary": summary,
    }


def main() -> None:
    report = build_report()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if report["overall_status"] == "ok" else 1)


if __name__ == "__main__":
    main()
