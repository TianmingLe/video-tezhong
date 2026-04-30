import asyncio
import sys
import types


def test_parse_cmd_has_llm_fields(monkeypatch):
    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)

    from cmd_arg import arg

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "main.py",
            "--platform",
            "dy",
            "--pipeline",
            "mvp",
            "--specified_id",
            "x",
            "--enable-llm",
            "true",
            "--llm-model",
            "m",
            "--llm-base-url",
            "http://x/v1",
        ],
    )
    ns = asyncio.run(arg.parse_cmd())
    assert hasattr(ns, "enable_llm")
    assert hasattr(ns, "llm_model")
    assert hasattr(ns, "llm_base_url")
