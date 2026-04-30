import asyncio
import json
import sys
import types
from pathlib import Path


def test_phase25_dry_run_entry(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    p = Path("data/douyin/jsonl")
    p.mkdir(parents=True, exist_ok=True)
    (p / "search_contents_2099-01-01.jsonl").write_text(
        json.dumps(
            {
                "aweme_id": "1",
                "liked_count": "2",
                "aweme_url": "u1",
                "video_download_url": "d1",
                "source_keyword": "AI教程",
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
            "dy",
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
        ],
    )

    import main as main_mod

    asyncio.run(main_mod.main())
    runs = Path("results/runs")
    assert runs.exists()
