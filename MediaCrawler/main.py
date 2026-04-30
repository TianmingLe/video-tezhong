# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/main.py
# GitHub: https://github.com/NanmiCoder
# Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1
#

# 声明：本代码仅供学习和研究目的使用。使用者应遵守以下原则：
# 1. 不得用于任何商业用途。
# 2. 使用时应遵守目标平台的使用条款和robots.txt规则。
# 3. 不得进行大规模爬取或对平台造成运营干扰。
# 4. 应合理控制请求频率，避免给目标平台带来不必要的负担。
# 5. 不得用于任何非法或不当的用途。
#
# 详细许可条款请参阅项目根目录下的LICENSE文件。
# 使用本代码即表示您同意遵守上述原则和LICENSE中的所有条款。

import sys
import io

# Force UTF-8 encoding for stdout/stderr to prevent encoding errors
# when outputting Chinese characters in non-UTF-8 terminals
if sys.stdout and hasattr(sys.stdout, 'buffer'):
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr and hasattr(sys.stderr, 'buffer'):
    if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import asyncio
from typing import Optional, Type

import cmd_arg
import config
import os
import shutil
from base.base_crawler import AbstractCrawler


class CrawlerFactory:
    @staticmethod
    def create_crawler(platform: str) -> AbstractCrawler:
        if platform == "xhs":
            from media_platform.xhs import XiaoHongShuCrawler

            return XiaoHongShuCrawler()
        if platform == "dy":
            from media_platform.douyin import DouYinCrawler

            return DouYinCrawler()
        if platform == "ks":
            from media_platform.kuaishou import KuaishouCrawler

            return KuaishouCrawler()
        if platform == "bili":
            from media_platform.bilibili import BilibiliCrawler

            return BilibiliCrawler()
        if platform == "wb":
            from media_platform.weibo import WeiboCrawler

            return WeiboCrawler()
        if platform == "tieba":
            from media_platform.tieba import TieBaCrawler

            return TieBaCrawler()
        if platform == "zhihu":
            from media_platform.zhihu import ZhihuCrawler

            return ZhihuCrawler()

        raise ValueError(f"Invalid media platform: {platform!r}. Supported: bili, dy, ks, tieba, wb, xhs, zhihu")


crawler: Optional[AbstractCrawler] = None


def _flush_excel_if_needed() -> None:
    if config.SAVE_DATA_OPTION != "excel":
        return

    try:
        from store.excel_store_base import ExcelStoreBase

        ExcelStoreBase.flush_all()
        print("[Main] Excel files saved successfully")
    except Exception as e:
        print(f"[Main] Error flushing Excel data: {e}")


async def _generate_wordcloud_if_needed() -> None:
    if config.SAVE_DATA_OPTION not in ("json", "jsonl") or not config.ENABLE_GET_WORDCLOUD:
        return

    try:
        from tools.async_file_writer import AsyncFileWriter
        from var import crawler_type_var

        file_writer = AsyncFileWriter(
            platform=config.PLATFORM,
            crawler_type=crawler_type_var.get(),
        )
        await file_writer.generate_wordcloud_from_comments()
    except Exception as e:
        print(f"[Main] Error generating wordcloud: {e}")


async def main() -> None:
    global crawler

    args = await cmd_arg.parse_cmd()
    if args.init_db:
        from database import db

        await db.init_db(args.init_db)
        print(f"Database {args.init_db} initialized successfully.")
        return

    if getattr(args, "pipeline", "") == "mvp":
        if getattr(args, "type", "detail") == "search":
            from datetime import datetime
            from pathlib import Path

            from services.batch_processor import BatchProcessor
            from services.knowledge_base import KnowledgeBase
            from services.run_context import RunContext
            from services.search_reader import read_topn_search_results

            keyword = str(getattr(args, "keywords", "") or "").split(",")[0].strip() or "keywords"
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            run_id = f"{ts}_{keyword}"
            run_id = "".join(ch if ch.isalnum() or ch in ("_", "-", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十") else "_" for ch in run_id)

            ctx = RunContext(run_root=Path("."), run_id=run_id)

            candidates = read_topn_search_results(limit=int(getattr(args, "limit", 1)))
            print(f'[INFO] 搜索关键词: "{keyword}", 找到 {len(candidates)} 个视频')
            print(f"[INFO] 按点赞排序，取 Top {min(len(candidates), int(getattr(args, 'limit', 1)))} 进行处理")

            bp = BatchProcessor(run_context=ctx)
            await bp.run(
                candidates=candidates,
                limit=int(getattr(args, "limit", 1)),
                dry_run=bool(getattr(args, "dry_run", False)),
                concurrent_limit=int(getattr(config, "BATCH_CONCURRENT_LIMIT", 3)),
                max_retries=int(getattr(config, "BATCH_MAX_RETRIES", 3)),
                retry_delay=float(getattr(config, "BATCH_RETRY_DELAY_SECONDS", 2)),
            )

            if not bool(getattr(args, "dry_run", False)):
                kb = KnowledgeBase(run_dir=ctx.run_dir(), run_id=run_id)
                kb.build(use_llm=False)
                print(f"[SUCCESS] 知识库聚合完成: {ctx.kb_summary_path()}")
            return

        if not getattr(args, "specified_id", ""):
            raise ValueError("mvp pipeline requires --specified_id")

        if not shutil.which("ffmpeg"):
            print("[MVP] FFmpeg not found in PATH. Whisper/yt-dlp may fail without ffmpeg.")

        config.PLATFORM = "dy"
        config.SAVE_DATA_OPTION = "jsonl"

        if getattr(args, "enable_llm", False):
            config.ENABLE_GET_COMMENTS = True

        specified_id = str(args.specified_id).split(",")[0].strip()
        from pipelines.mvp_pipeline import MVPPipeline

        pipeline = MVPPipeline(platform=config.PLATFORM)
        result = await pipeline.run(specified_id=specified_id)
        print(f"[MVP] status={result.get('status')} output=results/mvp_output.json")

        if getattr(args, "enable_llm", False):
            llm_model = str(getattr(args, "llm_model", "") or "")
            llm_base_url = str(getattr(args, "llm_base_url", "") or "")
            llm_api_key = str(getattr(args, "llm_api_key", "") or "") or os.getenv("OPENAI_API_KEY", "")

            if not llm_model or not llm_base_url:
                raise ValueError("enable-llm requires --llm-model and --llm-base-url (or set defaults in config)")

            from pipelines.analysis_pipeline import AnalysisPipeline

            analysis_pipeline = AnalysisPipeline()
            analysis = await analysis_pipeline.run(
                model=llm_model,
                api_base=llm_base_url,
                api_key=llm_api_key,
            )
            print(f"[LLM] status={analysis.get('status')} output=results/mvp_analysis.json report=results/mvp_report.md")

        return

    crawler = CrawlerFactory.create_crawler(platform=config.PLATFORM)
    await crawler.start()

    _flush_excel_if_needed()

    # Generate wordcloud after crawling is complete
    # Only for JSON save mode
    await _generate_wordcloud_if_needed()


async def async_cleanup() -> None:
    global crawler
    if crawler:
        if getattr(crawler, "cdp_manager", None):
            try:
                await crawler.cdp_manager.cleanup(force=True)
            except Exception as e:
                error_msg = str(e).lower()
                if "closed" not in error_msg and "disconnected" not in error_msg:
                    print(f"[Main] Error cleaning up CDP browser: {e}")

        elif getattr(crawler, "browser_context", None):
            try:
                await crawler.browser_context.close()
            except Exception as e:
                error_msg = str(e).lower()
                if "closed" not in error_msg and "disconnected" not in error_msg:
                    print(f"[Main] Error closing browser context: {e}")

    if config.SAVE_DATA_OPTION in ("db", "sqlite"):
        try:
            from database import db

            await db.close()
        except Exception:
            pass

if __name__ == "__main__":
    from tools.app_runner import run

    def _force_stop() -> None:
        c = crawler
        if not c:
            return
        cdp_manager = getattr(c, "cdp_manager", None)
        launcher = getattr(cdp_manager, "launcher", None)
        if not launcher:
            return
        try:
            launcher.cleanup()
        except Exception:
            pass

    run(main, async_cleanup, cleanup_timeout_seconds=15.0, on_first_interrupt=_force_stop)
