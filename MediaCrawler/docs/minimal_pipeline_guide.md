# 最小可复现 Pipeline 指南

本文档定义了 MediaCrawler 各 pipeline 的最小可复现运行方式，包括输入、输出和数据目录约定。

## 1. 通用约定

### 1.1 数据目录结构

```
MediaCrawler/
├── data/                          # 运行时数据根目录
│   └── _downloads/                # 视频临时下载目录
├── results/                       # 结果输出根目录
│   ├── mvp_output.json            # MVP Pipeline 单视频输出
│   ├── mvp_analysis.json          # LLM 分析结果
│   ├── mvp_report.md              # LLM 分析报告
│   └── runs/                      # 批处理运行目录
│       └── {run_id}/              # 每次运行一个子目录
│           ├── mvp_output_001_{aweme_id}.json
│           ├── mvp_analysis_001_{aweme_id}.json
│           ├── mvp_report_001_{aweme_id}.md
│           ├── processed_ids_{run_id}.jsonl
│           ├── dry_run_plan_{run_id}.json
│           ├── kb_index_{run_id}.jsonl
│           ├── kb_tags_{run_id}.json
│           └── kb_summary_{run_id}.md
└── store/                         # 各平台原始爬取数据
    └── {platform}/                # 按平台分目录
        └── {crawler_type}_*.jsonl # JSONL 格式原始数据
```

### 1.2 Run ID 格式

```
{YYYYMMDD}_{HHMMSS}_{keyword}
```

示例：`20260505_143000_编程副业`

### 1.3 JSONL 输出格式

每行一个 JSON 对象，字段约定：

| 字段 | 类型 | 说明 |
|------|------|------|
| `run_id` | string | 运行标识 |
| `platform` | string | 平台代号（dy/xhs/bili/ks/wb/tieba/zhihu） |
| `aweme_id` | string | 内容唯一标识 |
| `status` | string | success / failed |
| `error_code` | string? | 失败时的错误码 |
| `error_message` | string? | 失败时的错误信息 |
| `timestamp` | string | ISO 8601 时间戳 |

## 2. MVP Pipeline（单视频详情）

### 2.1 功能

抓取指定视频 → 下载 → ASR 转写 → OCR 提取（可选） → 输出结构化结果 → 清理视频但保留链接

### 2.2 前置依赖

- Python 3.11+
- FFmpeg（Whisper 与 yt-dlp 依赖）
- Chrome 浏览器（CDP 模式，版本 >= 144）

### 2.3 最小运行命令

```bash
cd MediaCrawler

# 抖音单视频
uv run main.py --platform dy --pipeline mvp --specified_id <视频ID或URL>

# 小红书单笔记
uv run main.py --platform xhs --pipeline mvp --specified_id <笔记ID或URL>
```

### 2.4 输入

| 参数 | 必填 | 说明 |
|------|------|------|
| `--platform` | 是 | 平台代号 |
| `--pipeline mvp` | 是 | 使用 MVP pipeline |
| `--specified_id` | 是 | 视频/笔记 ID 或 URL |

### 2.5 输出

文件：`results/mvp_output.json`

```json
{
  "platform": "dy",
  "video_id": "7123456789",
  "aweme_id": "7123456789",
  "video_url": "https://www.douyin.com/video/7123456789",
  "local_path": "data/_downloads/7123456789.mp4",
  "transcript": "视频转写文本...",
  "ocr_text": "OCR 提取文本（如启用）",
  "ocr_summary": {},
  "status": "success",
  "source_contents_file": "store/dy/detail_contents_20260505.jsonl"
}
```

### 2.6 验证

```bash
cat results/mvp_output.json | python -m json.tool
# 确认 status == "success"
# 确认 transcript 非空
```

## 3. Search + Batch Pipeline（搜索批处理）

### 3.1 功能

关键词搜索 → 按热度排序 → 批量处理 Top N 视频 → 知识库聚合

### 3.2 前置依赖

同 MVP Pipeline

### 3.3 最小运行命令

```bash
cd MediaCrawler

# 抖音搜索批处理（Top 3）
uv run main.py --platform dy --pipeline mvp --type search --keywords "编程副业" --limit 3

# 小红书搜索批处理
uv run main.py --platform xhs --pipeline mvp --type search --keywords "编程" --limit 5

# 预览模式（不实际执行）
uv run main.py --platform dy --pipeline mvp --type search --keywords "编程副业" --limit 3 --dry-run
```

### 3.4 输入

| 参数 | 必填 | 说明 |
|------|------|------|
| `--platform` | 是 | 平台代号 |
| `--pipeline mvp` | 是 | 使用 MVP pipeline |
| `--type search` | 是 | 搜索模式 |
| `--keywords` | 是 | 搜索关键词（逗号分隔） |
| `--limit` | 否 | 处理数量上限，默认 1，最大 50 |
| `--dry-run` | 否 | 仅预览不执行 |

### 3.5 输出

目录：`results/runs/{run_id}/`

| 文件 | 说明 |
|------|------|
| `mvp_output_*.json` | 每个视频的处理结果 |
| `mvp_analysis_*.json` | LLM 分析结果（如启用） |
| `mvp_report_*.md` | LLM 分析报告（如启用） |
| `processed_ids_*.jsonl` | 处理状态记录 |
| `dry_run_plan_*.json` | 预览计划（dry-run 模式） |
| `kb_summary_*.md` | 知识库摘要 |

### 3.6 验证

```bash
# 检查运行目录
ls results/runs/

# 检查处理状态
cat results/runs/{run_id}/processed_ids_*.jsonl

# 检查知识库摘要
cat results/runs/{run_id}/kb_summary_*.md
```

## 4. 基础爬虫 Pipeline（无 pipeline 模式）

### 4.1 功能

直接使用爬虫框架进行数据采集，存储为 JSONL/CSV/JSON/Excel/DB 等格式

### 4.2 最小运行命令

```bash
cd MediaCrawler

# 小红书搜索
uv run main.py --platform xhs --lt qrcode --type search

# 抖音详情
uv run main.py --platform dy --lt qrcode --type detail

# B站创作者
uv run main.py --platform bili --lt qrcode --type creator
```

### 4.3 输入

| 参数 | 必填 | 说明 |
|------|------|------|
| `--platform` | 是 | 平台代号 |
| `--lt` | 是 | 登录方式（qrcode/phone/cookie） |
| `--type` | 是 | 爬取类型（search/detail/creator） |

### 4.4 输出

存储在 `store/{platform}/` 目录下，格式由 `config/base_config.py` 中的 `SAVE_DATA_OPTION` 决定。

### 4.5 验证

```bash
# 检查输出文件
ls store/xhs/

# 检查 JSONL 内容
head -1 store/xhs/search_contents_*.jsonl | python -m json.tool
```

## 5. 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 登录失败 | Cookie 过期 | 重新扫码登录 |
| 下载失败 | 网络问题/视频下架 | 检查网络，尝试其他视频 |
| ASR 转写失败 | FFmpeg 未安装 | 安装 FFmpeg |
| OCR 不可用 | 模型未下载 | 设置 OCR_ENABLED=False |
| 批处理中断 | 单视频失败 | 查看 processed_ids_*.jsonl 中的失败记录 |
