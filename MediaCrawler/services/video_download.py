import asyncio
import errno
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional


class DownloadServiceErrorCode(str, Enum):
    INVALID_URL = "ERR_INVALID_URL"
    TIMEOUT = "ERR_TIMEOUT"
    DISK_FULL = "ERR_DISK_FULL"
    DOWNLOAD_FAILED = "ERR_DOWNLOAD_FAILED"
    DEPENDENCY_MISSING = "ERR_DEPENDENCY_MISSING"


@dataclass
class DownloadServiceError(Exception):
    code: DownloadServiceErrorCode
    message: str
    cause: Optional[BaseException] = None

    def __str__(self) -> str:
        return f"{self.code.value}: {self.message}"


class VideoDownloadService:
    def __init__(self, *, max_height: int = 1080) -> None:
        self.max_height = max_height

    async def download(self, url: str, output_dir: Path) -> Path:
        """
        使用 yt-dlp 下载视频到本地，返回最终文件路径。

        说明：
        - 该方法内部使用 asyncio.to_thread 包装阻塞下载逻辑，兼容 MediaCrawler 的 asyncio 架构。
        - Phase 1 目标是跑通链路，因此只做必要的参数控制与错误码映射。
        """

        output_dir.mkdir(parents=True, exist_ok=True)

        def _download_blocking() -> Path:
            try:
                import yt_dlp  # type: ignore
            except Exception as e:
                raise DownloadServiceError(
                    code=DownloadServiceErrorCode.DEPENDENCY_MISSING,
                    message="缺少依赖 yt-dlp，请先安装 requirements.txt 依赖",
                    cause=e,
                )

            outtmpl = str(output_dir / "%(id)s.%(ext)s")
            ydl_opts: Dict[str, Any] = {
                "outtmpl": outtmpl,
                "noplaylist": True,
                "format": f"best[height<={self.max_height}]/best",
                "quiet": True,
                "no_warnings": True,
                "retries": 3,
            }

            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    file_path = ydl.prepare_filename(info)
            except OSError as e:
                if getattr(e, "errno", None) == errno.ENOSPC:
                    raise DownloadServiceError(
                        code=DownloadServiceErrorCode.DISK_FULL,
                        message="磁盘空间不足，无法写入下载文件",
                        cause=e,
                    )
                raise DownloadServiceError(
                    code=DownloadServiceErrorCode.DOWNLOAD_FAILED,
                    message=f"下载失败：{e}",
                    cause=e,
                )
            except Exception as e:
                msg = str(e).lower()
                if "unsupported url" in msg or "no suitable extractor" in msg:
                    raise DownloadServiceError(
                        code=DownloadServiceErrorCode.INVALID_URL,
                        message=f"链接不受支持或已失效：{e}",
                        cause=e,
                    )
                if "timed out" in msg or "timeout" in msg:
                    raise DownloadServiceError(
                        code=DownloadServiceErrorCode.TIMEOUT,
                        message=f"下载超时：{e}",
                        cause=e,
                    )
                raise DownloadServiceError(
                    code=DownloadServiceErrorCode.DOWNLOAD_FAILED,
                    message=f"下载失败：{e}",
                    cause=e,
                )

            p = Path(file_path)
            if not p.exists():
                raise DownloadServiceError(
                    code=DownloadServiceErrorCode.DOWNLOAD_FAILED,
                    message="下载流程结束但未找到产物文件",
                )
            return p

        return await asyncio.to_thread(_download_blocking)

