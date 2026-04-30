# -*- coding: utf-8 -*-
# Copyright (c) 2025 relakkes@gmail.com
#
# This file is part of MediaCrawler project.
# Repository: https://github.com/NanmiCoder/MediaCrawler/blob/main/cmd_arg/arg.py
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


from __future__ import annotations


import sys
from enum import Enum
from types import SimpleNamespace
from typing import Iterable, Optional, Sequence, Type, TypeVar

import typer
from typing_extensions import Annotated

import config
from tools.utils import str2bool


EnumT = TypeVar("EnumT", bound=Enum)


class PlatformEnum(str, Enum):
    """Supported media platform enumeration"""

    XHS = "xhs"
    DOUYIN = "dy"
    KUAISHOU = "ks"
    BILIBILI = "bili"
    WEIBO = "wb"
    TIEBA = "tieba"
    ZHIHU = "zhihu"


class LoginTypeEnum(str, Enum):
    """Login type enumeration"""

    QRCODE = "qrcode"
    PHONE = "phone"
    COOKIE = "cookie"


class CrawlerTypeEnum(str, Enum):
    """Crawler type enumeration"""

    SEARCH = "search"
    DETAIL = "detail"
    CREATOR = "creator"


class SaveDataOptionEnum(str, Enum):
    """Data save option enumeration"""

    CSV = "csv"
    DB = "db"
    JSON = "json"
    JSONL = "jsonl"
    SQLITE = "sqlite"
    MONGODB = "mongodb"
    EXCEL = "excel"
    POSTGRES = "postgres"


class InitDbOptionEnum(str, Enum):
    """Database initialization option"""

    SQLITE = "sqlite"
    MYSQL = "mysql"
    POSTGRES = "postgres"


def _to_bool(value: bool | str) -> bool:
    if isinstance(value, bool):
        return value
    return str2bool(value)


def _coerce_enum(
    enum_cls: Type[EnumT],
    value: EnumT | str,
    default: EnumT,
) -> EnumT:
    """Safely convert a raw config value to an enum member."""

    if isinstance(value, enum_cls):
        return value

    try:
        return enum_cls(value)
    except ValueError:
        typer.secho(
            f"⚠️ Config value '{value}' is not within the supported range of {enum_cls.__name__}, falling back to default value '{default.value}'.",
            fg=typer.colors.YELLOW,
        )
        return default


def _normalize_argv(argv: Optional[Sequence[str]]) -> Iterable[str]:
    if argv is None:
        return list(sys.argv[1:])
    return list(argv)


def _inject_init_db_default(args: Sequence[str]) -> list[str]:
    """Ensure bare --init_db defaults to sqlite for backward compatibility."""

    normalized: list[str] = []
    i = 0
    while i < len(args):
        arg = args[i]
        normalized.append(arg)

        if arg == "--init_db":
            next_arg = args[i + 1] if i + 1 < len(args) else None
            if not next_arg or next_arg.startswith("-"):
                normalized.append(InitDbOptionEnum.SQLITE.value)
        i += 1

    return normalized


async def parse_cmd(argv: Optional[Sequence[str]] = None):
    """Parse command line arguments using Typer."""

    app = typer.Typer(add_completion=False)

    @app.callback(invoke_without_command=True)
    def main(
        platform: Annotated[
            PlatformEnum,
            typer.Option(
                "--platform",
                help="Media platform selection (xhs=XiaoHongShu | dy=Douyin | ks=Kuaishou | bili=Bilibili | wb=Weibo | tieba=Baidu Tieba | zhihu=Zhihu)",
                rich_help_panel="Basic Configuration",
            ),
        ] = _coerce_enum(PlatformEnum, config.PLATFORM, PlatformEnum.XHS),
        lt: Annotated[
            LoginTypeEnum,
            typer.Option(
                "--lt",
                help="Login type (qrcode=QR Code | phone=Phone | cookie=Cookie)",
                rich_help_panel="Account Configuration",
            ),
        ] = _coerce_enum(LoginTypeEnum, config.LOGIN_TYPE, LoginTypeEnum.QRCODE),
        crawler_type: Annotated[
            CrawlerTypeEnum,
            typer.Option(
                "--type",
                help="Crawler type (search=Search | detail=Detail | creator=Creator)",
                rich_help_panel="Basic Configuration",
            ),
        ] = _coerce_enum(CrawlerTypeEnum, config.CRAWLER_TYPE, CrawlerTypeEnum.SEARCH),
        start: Annotated[
            int,
            typer.Option(
                "--start",
                help="Starting page number",
                rich_help_panel="Basic Configuration",
            ),
        ] = config.START_PAGE,
        keywords: Annotated[
            str,
            typer.Option(
                "--keywords",
                help="Enter keywords, multiple keywords separated by commas",
                rich_help_panel="Basic Configuration",
            ),
        ] = config.KEYWORDS,
        get_comment: Annotated[
            str,
            typer.Option(
                "--get_comment",
                help="Whether to crawl first-level comments, supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="Comment Configuration",
                show_default=True,
            ),
        ] = str(config.ENABLE_GET_COMMENTS),
        get_sub_comment: Annotated[
            str,
            typer.Option(
                "--get_sub_comment",
                help="Whether to crawl second-level comments, supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="Comment Configuration",
                show_default=True,
            ),
        ] = str(config.ENABLE_GET_SUB_COMMENTS),
        headless: Annotated[
            str,
            typer.Option(
                "--headless",
                help="Whether to enable headless mode (applies to both Playwright and CDP), supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="Runtime Configuration",
                show_default=True,
            ),
        ] = str(config.HEADLESS),
        save_data_option: Annotated[
            SaveDataOptionEnum,
            typer.Option(
                "--save_data_option",
                help="Data save option (csv=CSV file | db=MySQL database | json=JSON file | jsonl=JSONL file | sqlite=SQLite database | mongodb=MongoDB database | excel=Excel file | postgres=PostgreSQL database)",
                rich_help_panel="Storage Configuration",
            ),
        ] = _coerce_enum(
            SaveDataOptionEnum, config.SAVE_DATA_OPTION, SaveDataOptionEnum.JSONL
        ),
        pipeline: Annotated[
            str,
            typer.Option(
                "--pipeline",
                help="Pipeline mode (e.g. mvp)",
                rich_help_panel="Basic Configuration",
            ),
        ] = "",
        limit: Annotated[
            int,
            typer.Option(
                "--limit",
                help="Limit the number of videos to process in search mode (1-50)",
                rich_help_panel="Basic Configuration",
            ),
        ] = 1,
        comment_depth: Annotated[
            int,
            typer.Option(
                "--comment-depth",
                help="Comment depth: 1=only top-level, 2=include sub-comments",
                rich_help_panel="Comment Configuration",
            ),
        ] = 1,
        output_format: Annotated[
            str,
            typer.Option(
                "--output-format",
                help="Output format: jsonl|markdown|all",
                rich_help_panel="Basic Configuration",
            ),
        ] = "all",
        dry_run: Annotated[
            str,
            typer.Option(
                "--dry-run",
                help="Dry run mode: only plan, no download/asr/llm, supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="Basic Configuration",
                show_default=True,
            ),
        ] = "false",
        enable_llm: Annotated[
            str,
            typer.Option(
                "--enable-llm",
                help="Enable LLM analysis pipeline, supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="LLM Configuration",
                show_default=True,
            ),
        ] = str(config.ENABLE_LLM),
        llm_model: Annotated[
            str,
            typer.Option(
                "--llm-model",
                help="LLM model name (user-provided string, e.g. THUDM/GLM-4.1V-9B-Thinking)",
                rich_help_panel="LLM Configuration",
            ),
        ] = config.LLM_MODEL,
        llm_base_url: Annotated[
            str,
            typer.Option(
                "--llm-base-url",
                help="OpenAI-compatible base_url (e.g. http://127.0.0.1:8000/v1)",
                rich_help_panel="LLM Configuration",
            ),
        ] = config.LLM_BASE_URL,
        llm_api_key: Annotated[
            str,
            typer.Option(
                "--llm-api-key",
                help="Optional API key for OpenAI-compatible service; if empty, read from env OPENAI_API_KEY",
                rich_help_panel="LLM Configuration",
            ),
        ] = "",
        init_db: Annotated[
            Optional[InitDbOptionEnum],
            typer.Option(
                "--init_db",
                help="Initialize database table structure (sqlite | mysql | postgres)",
                rich_help_panel="Storage Configuration",
            ),
        ] = None,
        cookies: Annotated[
            str,
            typer.Option(
                "--cookies",
                help="Cookie value used for Cookie login method",
                rich_help_panel="Account Configuration",
            ),
        ] = config.COOKIES,
        specified_id: Annotated[
            str,
            typer.Option(
                "--specified_id",
                help="Post/video ID list in detail mode, multiple IDs separated by commas (supports full URL or ID)",
                rich_help_panel="Basic Configuration",
            ),
        ] = "",
        creator_id: Annotated[
            str,
            typer.Option(
                "--creator_id",
                help="Creator ID list in creator mode, multiple IDs separated by commas (supports full URL or ID)",
                rich_help_panel="Basic Configuration",
            ),
        ] = "",
        max_comments_count_singlenotes: Annotated[
            int,
            typer.Option(
                "--max_comments_count_singlenotes",
                help="Maximum number of first-level comments to crawl per post/video",
                rich_help_panel="Comment Configuration",
            ),
        ] = config.CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES,
        top_comments: Annotated[
            int,
            typer.Option(
                "--top-comments",
                help="Top liked root comments to keep for LLM analysis",
                rich_help_panel="Comment Configuration",
            ),
        ] = config.TOP_COMMENTS_LIMIT,
        top_replies: Annotated[
            int,
            typer.Option(
                "--top-replies",
                help="Top liked replies to keep per root comment for LLM analysis",
                rich_help_panel="Comment Configuration",
            ),
        ] = config.TOP_REPLIES_LIMIT,
        force_regrab: Annotated[
            str,
            typer.Option(
                "--force-regrab",
                help="Force re-grab comments online even if cache exists, supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="Comment Configuration",
                show_default=True,
            ),
        ] = "false",
        ocr_enabled: Annotated[
            str,
            typer.Option(
                "--ocr-enabled",
                help="Enable OCR extraction from video frames, supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="OCR Configuration",
                show_default=True,
            ),
        ] = str(config.OCR_ENABLED),
        ocr_interval: Annotated[
            int,
            typer.Option(
                "--ocr-interval",
                help="Extract 1 frame every N seconds for OCR",
                rich_help_panel="OCR Configuration",
            ),
        ] = config.OCR_INTERVAL_SEC,
        ocr_model: Annotated[
            str,
            typer.Option(
                "--ocr-model",
                help="OCR model name/tag (e.g. ppocr_v4)",
                rich_help_panel="OCR Configuration",
            ),
        ] = config.OCR_MODEL,
        ocr_use_gpu: Annotated[
            str,
            typer.Option(
                "--ocr-use-gpu",
                help="Use GPU for OCR, supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="OCR Configuration",
                show_default=True,
            ),
        ] = str(config.OCR_USE_GPU),
        max_concurrency_num: Annotated[
            int,
            typer.Option(
                "--max_concurrency_num",
                help="Maximum number of concurrent crawlers",
                rich_help_panel="Performance Configuration",
            ),
        ] = config.MAX_CONCURRENCY_NUM,
        save_data_path: Annotated[
            str,
            typer.Option(
                "--save_data_path",
                help="Data save path, default is empty and will save to data folder",
                rich_help_panel="Storage Configuration",
            ),
        ] = config.SAVE_DATA_PATH,
        enable_ip_proxy: Annotated[
            str,
            typer.Option(
                "--enable_ip_proxy",
                help="Whether to enable IP proxy, supports yes/true/t/y/1 or no/false/f/n/0",
                rich_help_panel="Proxy Configuration",
                show_default=True,
            ),
        ] = str(config.ENABLE_IP_PROXY),
        ip_proxy_pool_count: Annotated[
            int,
            typer.Option(
                "--ip_proxy_pool_count",
                help="IP proxy pool count",
                rich_help_panel="Proxy Configuration",
            ),
        ] = config.IP_PROXY_POOL_COUNT,
        ip_proxy_provider_name: Annotated[
            str,
            typer.Option(
                "--ip_proxy_provider_name",
                help="IP proxy provider name (kuaidaili | wandouhttp)",
                rich_help_panel="Proxy Configuration",
            ),
        ] = config.IP_PROXY_PROVIDER_NAME,
    ) -> SimpleNamespace:
        """MediaCrawler 命令行入口"""

        enable_comment = _to_bool(get_comment)
        enable_sub_comment = _to_bool(get_sub_comment)
        enable_headless = _to_bool(headless)
        enable_ip_proxy_value = _to_bool(enable_ip_proxy)
        enable_llm_value = _to_bool(enable_llm)
        dry_run_value = _to_bool(dry_run)
        force_regrab_value = _to_bool(force_regrab)
        ocr_enabled_value = _to_bool(ocr_enabled)
        ocr_use_gpu_value = _to_bool(ocr_use_gpu)
        init_db_value = init_db.value if init_db else None

        safe_limit = int(limit) if int(limit) > 0 else 1
        if safe_limit > 50:
            safe_limit = 50

        safe_comment_depth = int(comment_depth)
        if safe_comment_depth not in (1, 2):
            safe_comment_depth = 1

        safe_top_comments = int(top_comments) if int(top_comments) > 0 else 20
        if safe_top_comments > 50:
            safe_top_comments = 50

        safe_top_replies = int(top_replies) if int(top_replies) > 0 else 5
        if safe_top_replies > 20:
            safe_top_replies = 20

        safe_ocr_interval = int(ocr_interval) if int(ocr_interval) > 0 else int(config.OCR_INTERVAL_SEC)

        # Parse specified_id and creator_id into lists
        specified_id_list = [id.strip() for id in specified_id.split(",") if id.strip()] if specified_id else []
        creator_id_list = [id.strip() for id in creator_id.split(",") if id.strip()] if creator_id else []

        # override global config
        config.PLATFORM = platform.value
        config.LOGIN_TYPE = lt.value
        config.CRAWLER_TYPE = crawler_type.value
        config.START_PAGE = start
        config.KEYWORDS = keywords
        config.ENABLE_GET_COMMENTS = enable_comment
        config.ENABLE_GET_SUB_COMMENTS = enable_sub_comment
        config.HEADLESS = enable_headless
        config.CDP_HEADLESS = enable_headless
        config.SAVE_DATA_OPTION = save_data_option.value
        config.COOKIES = cookies
        config.CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES = max_comments_count_singlenotes
        config.TOP_COMMENTS_LIMIT = safe_top_comments
        config.TOP_REPLIES_LIMIT = safe_top_replies
        config.OCR_ENABLED = ocr_enabled_value
        config.OCR_INTERVAL_SEC = safe_ocr_interval
        config.OCR_MODEL = ocr_model
        config.OCR_USE_GPU = ocr_use_gpu_value
        config.MAX_CONCURRENCY_NUM = max_concurrency_num
        config.SAVE_DATA_PATH = save_data_path
        config.ENABLE_IP_PROXY = enable_ip_proxy_value
        config.IP_PROXY_POOL_COUNT = ip_proxy_pool_count
        config.IP_PROXY_PROVIDER_NAME = ip_proxy_provider_name
        config.ENABLE_LLM = enable_llm_value
        config.LLM_MODEL = llm_model
        config.LLM_BASE_URL = llm_base_url
        config.LLM_API_KEY = llm_api_key

        if pipeline == "mvp":
            if config.CRAWLER_TYPE not in (CrawlerTypeEnum.SEARCH.value, CrawlerTypeEnum.DETAIL.value):
                config.CRAWLER_TYPE = CrawlerTypeEnum.DETAIL.value

        if safe_comment_depth == 1:
            config.ENABLE_GET_COMMENTS = True
            config.ENABLE_GET_SUB_COMMENTS = False
        elif safe_comment_depth == 2:
            config.ENABLE_GET_COMMENTS = True
            config.ENABLE_GET_SUB_COMMENTS = True

        # Set platform-specific ID lists for detail/creator mode
        if specified_id_list:
            if platform == PlatformEnum.XHS:
                config.XHS_SPECIFIED_NOTE_URL_LIST = specified_id_list
            elif platform == PlatformEnum.BILIBILI:
                config.BILI_SPECIFIED_ID_LIST = specified_id_list
            elif platform == PlatformEnum.DOUYIN:
                config.DY_SPECIFIED_ID_LIST = specified_id_list
            elif platform == PlatformEnum.WEIBO:
                config.WEIBO_SPECIFIED_ID_LIST = specified_id_list
            elif platform == PlatformEnum.KUAISHOU:
                config.KS_SPECIFIED_ID_LIST = specified_id_list

        if creator_id_list:
            if platform == PlatformEnum.XHS:
                config.XHS_CREATOR_ID_LIST = creator_id_list
            elif platform == PlatformEnum.BILIBILI:
                config.BILI_CREATOR_ID_LIST = creator_id_list
            elif platform == PlatformEnum.DOUYIN:
                config.DY_CREATOR_ID_LIST = creator_id_list
            elif platform == PlatformEnum.WEIBO:
                config.WEIBO_CREATOR_ID_LIST = creator_id_list
            elif platform == PlatformEnum.KUAISHOU:
                config.KS_CREATOR_ID_LIST = creator_id_list

        return SimpleNamespace(
            platform=config.PLATFORM,
            lt=config.LOGIN_TYPE,
            type=config.CRAWLER_TYPE,
            pipeline=pipeline,
            limit=safe_limit,
            comment_depth=safe_comment_depth,
            output_format=output_format,
            dry_run=dry_run_value,
            top_comments=safe_top_comments,
            top_replies=safe_top_replies,
            force_regrab=force_regrab_value,
            ocr_enabled=config.OCR_ENABLED,
            ocr_interval=config.OCR_INTERVAL_SEC,
            ocr_model=config.OCR_MODEL,
            ocr_use_gpu=config.OCR_USE_GPU,
            enable_llm=config.ENABLE_LLM,
            llm_model=config.LLM_MODEL,
            llm_base_url=config.LLM_BASE_URL,
            llm_api_key=config.LLM_API_KEY,
            start=config.START_PAGE,
            keywords=config.KEYWORDS,
            get_comment=config.ENABLE_GET_COMMENTS,
            get_sub_comment=config.ENABLE_GET_SUB_COMMENTS,
            headless=config.HEADLESS,
            save_data_option=config.SAVE_DATA_OPTION,
            init_db=init_db_value,
            cookies=config.COOKIES,
            specified_id=specified_id,
            creator_id=creator_id,
        )

    command = typer.main.get_command(app)

    cli_args = _normalize_argv(argv)
    cli_args = _inject_init_db_default(cli_args)

    try:
        result = command.main(args=cli_args, standalone_mode=False)
        if isinstance(result, int):  # help/options handled by Typer; propagate exit code
            raise SystemExit(result)
        return result
    except typer.Exit as exc:  # pragma: no cover - CLI exit paths
        raise SystemExit(exc.exit_code) from exc
