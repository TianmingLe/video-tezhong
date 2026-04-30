# OmniScraper Pro（video-tezhong）项目说明（草案）

本仓库用于构建一个面向自媒体平台的“采集 → 下载 → 处理（ASR/OCR/LLM）→ 导出”的一体化工具链。目前已完成 Phase 1（MVP）核心链路验证：以抖音（dy）为验证平台，在不改动爬虫核心逻辑的前提下，实现命令行模式的“抓取 detail → 下载视频（yt-dlp）→ Whisper 转写 → 产出结构化结果 → 清理视频文件但保留链接”闭环。

当前实现更偏工程化验证：功能可用、链路可跑通，但还不包含桌面端、批量任务、LLM 分析与多格式导出等完整产品能力。本文档用于梳理“现在做到了什么、缺什么、下一步怎么做”，供你审查确认后再同步到 README。

## 当前已实现的能力（Phase 1）

### 1) 抖音 detail 抓取（复用 MediaCrawler）

- 支持通过 `--specified_id` 输入抖音视频 URL 或视频 ID，走 detail 模式抓取内容数据
- 抓取结果会落盘为 JSONL，包含 `aweme_url` 与 `video_download_url`

### 2) MVP Pipeline（dy / detail）命令行闭环

入口命令：

```bash
python MediaCrawler/main.py --platform dy --pipeline mvp --specified_id <视频ID或URL>
```

执行流程（概念）：

- 调用原生爬虫 detail 流程生成 `data/douyin/jsonl/detail_contents_*.jsonl`
- 从上述 JSONL 读取 `video_download_url`
- 使用 yt-dlp 下载视频到 `data/_downloads/`
- 使用 Whisper-small 转写生成带时间戳的文本
- 写出结果到 `results/mvp_output.json`
- 转写完成后删除本地视频文件，但 JSON 中保留 `video_url` 与 `local_path` 字段用于溯源

输出示例（字段）：

```json
{
  "video_url": "https://www.douyin.com/video/xxxx",
  "local_path": "data/_downloads/xxxx.mp4",
  "transcript": "[00:00:00.000 --> 00:00:01.234] ...",
  "status": "success",
  "source_contents_file": "data/douyin/jsonl/detail_contents_2026-04-30.jsonl"
}
```

### 3) 单元测试（Phase 1 核心逻辑）

- 覆盖下载服务、ASR 服务、pipeline 输出结构与清理行为、错误码返回
- 测试文件：`MediaCrawler/tests/test_mvp_pipeline.py`

运行：

```bash
cd MediaCrawler
pytest tests/test_mvp_pipeline.py -v
```

## 当前代码结构（与 Phase 1 直接相关）

位于 `MediaCrawler/` 子目录内：

- `pipelines/mvp_pipeline.py`：MVP 串联流程与输出写入
- `services/video_download.py`：yt-dlp 下载封装（含错误码）
- `services/asr_transcribe.py`：Whisper 转写封装（输出带时间戳文本）
- `cmd_arg/arg.py`：新增 `--pipeline` 参数
- `main.py`：新增 `--pipeline mvp` 分支入口

## 已知缺陷与风险点（需要明确）

### 1) 依赖体积与安装体验

- `openai-whisper` 会拉取 `torch`，在部分环境会默认安装包含 CUDA 组件的大体积版本，安装慢、占用大
- 运行依赖 `ffmpeg`（若未安装会失败）

建议方向：

- 提供“CPU-only 安装说明”（或提供可选的 `requirements-cpu.txt`）
- 启动时增加更明确的依赖检查与修复指引（ffmpeg / torch / whisper 模型缓存）

### 2) 目前仅支持 dy + detail 单条链路

- Phase 1 仅验证 dy/detail，并且 pipeline 只处理单条 `specified_id`
- 尚未实现 search + limit 批量处理、任务队列、失败重试、断点续跑等能力

### 3) 产出格式仍偏“工程调试输出”

- `results/mvp_output.json` 是单文件覆盖写，不支持多条记录、批次、可追踪的 run_id
- transcript 目前是可读文本，但还没有结构化段落、语言识别、质量评估等元数据

### 4) 运行时稳定性与可观测性不足

- 日志目前主要依赖 print / 现有 logger，不是完整的任务级日志（任务开始/结束、耗时、错误堆栈归一化）
- 下载/转写的错误码已做基础映射，但缺少更细粒度的网络错误分类与重试策略

### 5) 仓库组织与定位

- 当前仓库根目录内容较少，真正可运行的代码在 `MediaCrawler/` 下
- 对使用者而言，需要更清晰的“仓库入口 README”来引导安装与运行

## 下一步计划（建议路线图）

### Phase 1.5（最优先：把 MVP 变成可用的小工具）

- 增加 search + `--limit`：
  - CLI 新增 `--limit`（默认 1，最大 20）
  - pipeline 支持 `--type search`，从 `search_contents_*.jsonl` 读取多条
  - 输出切换为 `results/mvp_output.jsonl`（每行一个视频结果，便于批处理与追溯）
- 增加批处理鲁棒性：
  - 单条失败不影响剩余任务（记录 error_code/error_message）
  - 支持超时控制与有限重试
- 增加 run_id 与输出归档：
  - `results/runs/<run_id>/mvp_output.jsonl`
  - 同时保留一份 `run_meta.json`（开始/结束时间、参数、环境信息）

### Phase 2（AI 分析引擎与导出）

- 接入 LiteLLM 做统一 LLM 调用，支持多模型切换
- 基于 transcript 生成结构化分析（摘要、要点、标题、章节、金句、标签）
- 增加导出：
  - Markdown / CSV / Excel / Word（对齐你计划书）

### Phase 3（桌面端与产品化）

- Electron 桌面端封装：
  - 任务创建、队列、日志、结果预览与下载
  - 后端通过 WebSocket 推送进度
- 打包与分发：
  - 后端 PyInstaller（或 uv + python 运行时打包方案）
  - Electron builder（Win/macOS/Linux）

## 你审查时建议重点关注的点

- “当前已实现”是否准确、是否遗漏你关心的能力
- 缺陷清单是否需要补充（尤其是你实际使用场景里的障碍）
- 路线图优先级是否符合你的目标：先做命令行可用，还是尽快做桌面端

