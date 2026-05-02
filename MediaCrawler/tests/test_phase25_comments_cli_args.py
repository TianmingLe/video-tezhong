import asyncio
import sys
import types


def _stub_tools_utils(monkeypatch):
    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)


def test_parse_cmd_has_comment_tuning_fields(monkeypatch):
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
            "--specified_id",
            "x",
            "--comment-depth",
            "2",
            "--top-comments",
            "10",
            "--top-replies",
            "3",
            "--force-regrab",
            "true",
        ],
    )
    ns = asyncio.run(arg.parse_cmd())
    assert ns.top_comments == 10
    assert ns.top_replies == 3
    assert ns.force_regrab is True

