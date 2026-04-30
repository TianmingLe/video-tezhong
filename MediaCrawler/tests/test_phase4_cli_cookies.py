import asyncio
import sys
import types


def _stub_tools_utils(monkeypatch):
    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)


def test_parse_cmd_has_platform_cookie_fields(monkeypatch):
    _stub_tools_utils(monkeypatch)
    from cmd_arg import arg

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "main.py",
            "--platform",
            "xhs",
            "--pipeline",
            "mvp",
            "--specified_id",
            "66abcd000000000000000000",
            "--xhs-cookie",
            "c1",
            "--dy-cookie",
            "c2",
            "--bili-cookie",
            "c3",
        ],
    )
    ns = asyncio.run(arg.parse_cmd())
    assert ns.xhs_cookie == "c1"
    assert ns.dy_cookie == "c2"
    assert ns.bili_cookie == "c3"

