import asyncio
import sys
import types


def _stub_tools_utils(monkeypatch):
    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)


def test_parse_cmd_has_ocr_fields(monkeypatch):
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
            "--ocr-enabled",
            "true",
            "--ocr-interval",
            "10",
            "--ocr-model",
            "ppocr_v4",
            "--ocr-use-gpu",
            "false",
        ],
    )
    ns = asyncio.run(arg.parse_cmd())
    assert ns.ocr_enabled is True
    assert ns.ocr_interval == 10
    assert ns.ocr_model == "ppocr_v4"
    assert ns.ocr_use_gpu is False

