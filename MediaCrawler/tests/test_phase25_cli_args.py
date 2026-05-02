import asyncio
import sys
import types


def _stub_tools_utils(monkeypatch):
    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)


def test_parse_cmd_has_phase25_fields(monkeypatch):
    _stub_tools_utils(monkeypatch)
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
            "--type",
            "search",
            "--keywords",
            "AI教程",
            "--limit",
            "3",
            "--comment-depth",
            "2",
            "--output-format",
            "all",
            "--dry-run",
            "true",
        ],
    )
    ns = asyncio.run(arg.parse_cmd())
    assert ns.type in ("search", "detail")
    assert ns.keywords == "AI教程"
    assert ns.limit == 3
    assert ns.comment_depth == 2
    assert ns.output_format == "all"
    assert ns.dry_run is True

