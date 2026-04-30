# OmniScraper Pro（video-tezhong）

一个面向自媒体内容的“采集 → 下载 → 处理（ASR/OCR/LLM）→ 导出”的工具链项目。当前已完成 Phase 1（MVP）核心链路：以抖音（dy）为验证平台，实现命令行模式的“抓取 detail → 下载视频（yt-dlp）→ Whisper 转写 → 输出结构化结果 → 清理视频但保留链接”闭环。

## 当前实现的主要功能（Phase 1）

- 抖音 detail 抓取：通过 `--specified_id` 输入视频 URL 或 ID，抓取内容并落盘 JSONL（包含 `aweme_url` / `video_download_url`）
- MVP Pipeline：从落盘 JSONL 读取视频下载链接，完成下载 + ASR 转写，并输出 `results/mvp_output.json`
- 自动清理：转写完成后删除视频文件，但在 JSON 中保留 `video_url` 与 `local_path` 字段用于溯源
- 单元测试：覆盖下载服务、ASR 服务、pipeline 输出与清理行为（`MediaCrawler/tests/test_mvp_pipeline.py`）

## 快速开始（dy / detail / mvp）

前置依赖：

- Python 3.11+
- FFmpeg（Whisper 与 yt-dlp 依赖）

运行：

```bash
cd MediaCrawler
python main.py --platform dy --pipeline mvp --specified_id <视频ID或URL>
cat ../results/mvp_output.json
```

## 代码位置

本仓库的可运行代码位于 `MediaCrawler/` 目录：

- Pipeline：`MediaCrawler/pipelines/mvp_pipeline.py`
- 下载服务：`MediaCrawler/services/video_download.py`
- ASR 服务：`MediaCrawler/services/asr_transcribe.py`

## 下一步计划（建议）

- Phase 1.5：支持 `search + --limit` 批处理，输出 `results/mvp_output.jsonl`（每行一条结果），加入 run_id 与失败不影响后续任务
- Phase 2：接入 LLM（LiteLLM）做摘要/标签/结构化分析，并提供 Markdown/Word/Excel 导出
- Phase 3：封装 Electron 桌面端与打包分发
