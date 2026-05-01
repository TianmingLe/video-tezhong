import asyncio
import json
import sys
import types
from pathlib import Path


def test_bili_sort_click_log(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    Path("data/bili/jsonl").mkdir(parents=True, exist_ok=True)
    Path("data/bili/jsonl/search_contents_2099-01-01.jsonl").write_text(
        json.dumps(
            {
                "video_id": "av1",
                "video_url": "https://www.bilibili.com/video/av1",
                "create_time": 1,
                "video_play_count": "999",
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)

    fake_database = types.ModuleType("database")
    fake_db = types.SimpleNamespace(init_db=lambda *args, **kwargs: None)
    fake_database.db = fake_db
    monkeypatch.setitem(sys.modules, "database", fake_database)
    monkeypatch.setitem(sys.modules, "database.db", fake_db)

    fake_playwright = types.ModuleType("playwright")
    fake_async_api = types.ModuleType("playwright.async_api")
    fake_async_api.BrowserContext = object
    fake_async_api.BrowserType = object
    fake_async_api.Playwright = object
    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.async_api", fake_async_api)

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "main.py",
            "--platform",
            "bili",
            "--pipeline",
            "mvp",
            "--type",
            "search",
            "--keywords",
            "AI教程",
            "--limit",
            "1",
            "--dry-run",
            "true",
            "--bili-sort",
            "click",
        ],
    )

    import main as main_mod

    asyncio.run(main_mod.main())
    out = capsys.readouterr().out
    assert "播放量" in out or "click" in out

