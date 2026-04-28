import asyncio
import shutil
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional


class ASRErrorCode(str, Enum):
    DEPENDENCY_MISSING = "ERR_ASR_DEPENDENCY_MISSING"
    FFMPEG_MISSING = "ERR_FFMPEG_MISSING"
    TRANSCRIBE_FAILED = "ERR_TRANSCRIBE_FAILED"


@dataclass
class ASRServiceError(Exception):
    code: ASRErrorCode
    message: str
    cause: Optional[BaseException] = None

    def __str__(self) -> str:
        return f"{self.code.value}: {self.message}"


def _format_srt_timestamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    hh = ms // 3_600_000
    ms %= 3_600_000
    mm = ms // 60_000
    ms %= 60_000
    ss = ms // 1000
    ms %= 1000
    return f"{hh:02d}:{mm:02d}:{ss:02d}.{ms:03d}"


class ASRService:
    def __init__(self, *, model_name: str = "small") -> None:
        self.model_name = model_name
        self._model = None

    def _ensure_ffmpeg(self) -> None:
        if shutil.which("ffmpeg"):
            return
        raise ASRServiceError(
            code=ASRErrorCode.FFMPEG_MISSING,
            message="未检测到 FFmpeg，请先安装并加入 PATH（Whisper 依赖 ffmpeg）",
        )

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model

        try:
            import whisper  # type: ignore
        except Exception as e:
            raise ASRServiceError(
                code=ASRErrorCode.DEPENDENCY_MISSING,
                message="缺少依赖 openai-whisper，请先安装 requirements.txt 依赖",
                cause=e,
            )

        try:
            self._model = whisper.load_model(self.model_name)
            return self._model
        except Exception as e:
            raise ASRServiceError(
                code=ASRErrorCode.TRANSCRIBE_FAILED,
                message=f"Whisper 模型加载失败：{e}",
                cause=e,
            )

    async def transcribe(self, video_path: Path, *, language: str = "zh") -> str:
        """
        使用 Whisper 对视频进行转写，输出带时间戳的纯文本（SRT-like 但不严格编号）。

        说明：
        - Whisper 与音频解码属于阻塞操作，因此使用 asyncio.to_thread 运行。
        - 输出格式示例：
          [00:00:01.000 --> 00:00:02.500] 你好世界
        """

        def _transcribe_blocking() -> str:
            self._ensure_ffmpeg()
            model = self._load_model()

            try:
                result: Dict[str, Any] = model.transcribe(
                    str(video_path),
                    language=language,
                    fp16=False,
                )
            except Exception as e:
                raise ASRServiceError(
                    code=ASRErrorCode.TRANSCRIBE_FAILED,
                    message=f"转写失败：{e}",
                    cause=e,
                )

            segments: List[Dict[str, Any]] = result.get("segments") or []
            lines: List[str] = []
            for seg in segments:
                start = float(seg.get("start", 0.0))
                end = float(seg.get("end", 0.0))
                text = (seg.get("text") or "").strip()
                if not text:
                    continue
                lines.append(
                    f"[{_format_srt_timestamp(start)} --> {_format_srt_timestamp(end)}] {text}"
                )

            return "\n".join(lines).strip()

        return await asyncio.to_thread(_transcribe_blocking)

