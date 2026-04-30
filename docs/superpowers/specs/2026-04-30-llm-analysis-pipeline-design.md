# LLM 分析与报告（Phase 2 / 方案 B）设计文档

## 背景与目标

当前仓库已完成 Phase 1（MVP）能力：以抖音（dy）detail 模式验证“抓取 → 下载（yt-dlp）→ ASR（Whisper）→ 输出 results/mvp_output.json → 删除视频文件但保留链接”的命令行闭环。

本阶段目标是在不破坏现有 MVP 的前提下，新增可选的 LLM 智能分析能力：基于 ASR transcript（并预留 OCR 输入）完成评论价值判定、知识点提取、以及 Markdown 报告生成，并输出结构化 JSON。

## 范围（本次要做 / 不做）

### 本次要做

- 新增 LLM 分析流水线（方案 B：与 MVP pipeline 解耦）
- 新增 CLI 开关：`--enable-llm` 触发分析
- 支持用户自定义模型与 OpenAI 兼容服务地址：
  - `--llm-model`：模型名字符串（用户填写）
  - `--llm-base-url`：OpenAI 兼容接口地址（用户填写，通常以 `/v1` 结尾）
  - `--llm-api-key`：可选（若不传则从环境变量读取）
- LiteLLM 接入（Python SDK），并实现：
  - Token 统计（prompt/completion/total）
  - 成本统计（USD，若 LiteLLM 可计算）
  - 30 分钟缓存（相同输入不重复调用）
  - 错误降级（失败输出空结果 + 明确错误码）
- 输出文件：
  - `results/mvp_output.json`（保持原有）
  - `results/mvp_analysis.json`（新增）
  - `results/mvp_report.md`（新增）

### 本次不做

- OCR（PaddleOCR）实现（仅预留输入字段）
- Electron/FastAPI/WebSocket（留到后续 Phase）
- search + limit 批处理（Phase 1.5）

## 总体架构（方案 B）

### 1) 两段流水线

- **MVPPipeline（已存在）**
  - 输入：`--specified_id`
  - 产物：`results/mvp_output.json` + `data/douyin/jsonl/detail_contents_*.jsonl`（以及可选 comments jsonl）
  - 不负责 LLM 分析

- **AnalysisPipeline（新增）**
  - 输入：读取 `results/mvp_output.json` 作为主输入
  - 可选输入：从 `data/douyin/jsonl/*comments*.jsonl` 读取评论数据（仅当启用评论抓取）
  - 产物：`results/mvp_analysis.json` 与 `results/mvp_report.md`

### 2) 执行顺序（main 入口）

当命令形如：

```bash
python main.py --platform dy --pipeline mvp --specified_id <id-or-url> --enable-llm
```

执行顺序为：

1. 运行 MVPPipeline（确保 `results/mvp_output.json` 生成）
2. 运行 AnalysisPipeline（读 mvp_output.json → 调 LLM → 写 analysis/report）

若 LLM 分析失败：

- **MVPPipeline 的输出仍然必须存在且不受影响**
- `mvp_analysis.json` 写入 `status=error` + 错误码/错误信息
- `mvp_report.md` 写入“分析失败/降级说明”（或生成一个最小报告）

## CLI 与配置设计

### CLI 参数

- `--enable-llm`：是否启用 LLM 分析（默认 false）
- `--llm-model`：模型名称（字符串，用户填写；示例：`THUDM/GLM-4.1V-9B-Thinking`）
- `--llm-base-url`：OpenAI 兼容接口 base_url（字符串，用户填写；示例：`http://127.0.0.1:8000/v1`）
- `--llm-api-key`：可选；不传则从环境变量读取（建议优先环境变量，避免在 shell history 中泄露）
- `--llm-temperature` / `--llm-max-tokens` / `--llm-timeout-s`：可选参数（若不加，走 config 默认）

### 配置文件

新增（示例/默认值）：

- `MediaCrawler/config/llm_config.yaml`
  - `default_model: ""`（空表示必须由 CLI 或环境变量指定）
  - `default_base_url: ""`
  - `timeout_s: 60`
  - `temperature: 0.2`
  - `max_tokens: 1200`
  - `cache_ttl_seconds: 1800`
  - `cache_type: memory | redis`
  - `prompt_file: config/prompts.yaml`

- `MediaCrawler/config/prompts.yaml`
  - `comment_value_judge`：评论价值判定 Prompt（可配置）
  - `knowledge_extract`：知识点提取 Prompt（可配置）
  - `report_generate`：报告生成 Prompt（可配置）

配置加载策略：

- 运行时优先级：**CLI 参数 > 环境变量 > YAML 默认值**
- API Key 读取策略：
  - 优先 `--llm-api-key`
  - 否则读取 `OPENAI_API_KEY`（或允许在 YAML 中指定 env var name）

## LLM 调用设计（LiteLLM）

### 统一调用接口

新增 `services/llm_client.py`，提供：

- `async completion(messages, model, api_base, api_key, temperature, max_tokens, timeout_s) -> LLMResult`
- `LLMResult` 至少包含：
  - `text`
  - `usage: {prompt_tokens, completion_tokens, total_tokens}`
  - `cost_usd`（可选，无法计算时为 null）
  - `raw_provider`（可选）

LiteLLM OpenAI 兼容调用关键参数：

- `api_base` 指向用户提供的 OpenAI 兼容服务（通常 `/v1`）
- `api_key` 为用户提供的 key（或占位 key）
- token 统计从 OpenAI 标准 `usage` 字段获取
- 成本统计优先使用 LiteLLM 提供的成本计算能力（如响应内 `response_cost` 或基于 response 的 cost 计算工具）；若模型名不在价目表中，成本可为空并给出提示

参考：LiteLLM 提供 `completion_cost` / `token_counter` 等辅助能力用于 token 与 cost 统计（其文档对外提供了这类接口）【来源：LiteLLM Token Usage 文档】。

## 缓存机制（30 分钟）

目的：同样输入在 30 分钟内不重复调用 LLM，降低成本与延迟。

### 缓存 Key

建议 key：

```
sha256(
  model + "|" +
  prompt_name + "|" +
  prompt_text + "|" +
  json.dumps(inputs, sort_keys=True, ensure_ascii=False)
)
```

### 缓存后端

- 默认：内存缓存（复用现有 `cache/ExpiringLocalCache`）
- 可选：redis 缓存（复用现有 `cache/RedisCache`，当用户已有 redis 环境时更稳定）

缓存 value：序列化后的 `LLMResult`（或 `analysis` 子结果），避免重复解析。

## 分析能力设计（3 个核心模块）

### A) 评论价值判定（Comment Value Judge）

输入：

- `video_topic`：视频主题（优先使用标题；缺失则用 transcript 前 N 字生成一个简要主题）
- `comments[]`：评论列表（文本 + 点赞数 + 其他字段）

输出（逐条）：

```json
{
  "is_valuable": true,
  "tags": ["#运营技巧"],
  "reason": "..."
}
```

策略：

- 默认选择 Top N 评论（按 like_count）进入判定（N 可配置，默认 20）
- 输出需要可解释（reason）与可标签化（tags）
- 若评论数据不存在：该模块返回空列表，并在 analysis 中标注 `missing_comments=true`

### B) 知识点提取（Knowledge Extract）

输入：

- `transcript`：ASR 输出（带时间戳）
- `ocr_text`：预留字段（本阶段为空或不传）

输出：

```json
[
  {"title": "...", "content": "...", "timestamp": "00:01:23.456"},
  {"title": "...", "content": "...", "timestamp": "00:04:10.000"}
]
```

约束：

- timestamp 必须来源于 transcript 的时间戳（或就近匹配）
- 结果数量可配置（默认 5-12 条）

### C) Markdown 报告生成（Report Generator）

输入：

- `video_info`（URL、标题、作者等尽量从 content jsonl 读取）
- `valuable_comments`（A 的结果 + 评论原文）
- `knowledge_points`（B 的结果）

输出：

- `results/mvp_report.md`
- 结构建议：
  - 视频信息（url、抓取时间、来源文件）
  - 关键结论（TL;DR）
  - 知识点列表（带时间戳）
  - 高价值评论（含 tags/reason）
  - 可执行建议（面向运营/复盘）

## 数据读取策略（与现有落盘兼容）

### 读取 mvp_output.json

作为 AnalysisPipeline 的主输入，包含：

- `video_url`
- `transcript`
- `source_contents_file`

### 读取 content jsonl

从 `source_contents_file` 反向定位内容条目，补齐视频元信息（标题/作者/点赞评论数等）。

### 读取 comments jsonl（可选）

当启用评论抓取时，从 `data/douyin/jsonl/*comments*.jsonl` 读取评论条目，并按 `aweme_id` 关联到当前视频。

备注：本阶段只要求“能读取并用于判定”，不要求重构现有 store 逻辑。

## 输出格式（mvp_analysis.json）

建议结构（示例）：

```json
{
  "status": "success",
  "video_url": "https://www.douyin.com/video/...",
  "model": {
    "model": "THUDM/GLM-4.1V-9B-Thinking",
    "api_base": "http://127.0.0.1:8000/v1"
  },
  "cache": {
    "ttl_seconds": 1800,
    "hit": false
  },
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 567,
    "total_tokens": 1801,
    "cost_usd": null
  },
  "comment_value_judge": {
    "missing_comments": false,
    "items": [
      {
        "comment_text": "...",
        "like_count": 123,
        "is_valuable": true,
        "tags": ["#运营技巧"],
        "reason": "..."
      }
    ]
  },
  "knowledge_points": [
    {"title": "...", "content": "...", "timestamp": "00:01:23.456"}
  ],
  "suggestions": [
    "..."
  ]
}
```

若失败：

```json
{
  "status": "error",
  "error_code": "ERR_LLM_TIMEOUT",
  "error_message": "...",
  "video_url": "...",
  "usage": {... optional ...}
}
```

## 错误码（最低集合）

- `ERR_LLM_DEPENDENCY_MISSING`：未安装 litellm
- `ERR_LLM_CONFIG_INVALID`：缺少 model/base_url 等关键配置
- `ERR_LLM_AUTH`：鉴权失败（401/403）
- `ERR_LLM_TIMEOUT`：超时
- `ERR_LLM_FAILED`：其他调用失败（网络/5xx/解析错误）
- `ERR_ANALYSIS_IO`：读写文件失败（mvp_output.json / analysis/report 写入）

## 测试策略（TDD）

新增测试文件（示例命名）：

- `MediaCrawler/tests/test_analysis_pipeline.py`

至少覆盖：

- 缓存命中：同输入第二次不触发 LLM 调用
- 错误降级：模拟 LLM 调用失败时输出 `status=error`，且不影响 `mvp_output.json`
- 报告生成：给定固定 analysis 结构，输出 Markdown 含关键段落

测试实现建议：

- 通过 monkeypatch 注入 fake 的 `LLMClient`（避免真实网络调用）
- 使用临时目录隔离 results/data 文件

## 迁移与后续扩展

- Phase 1.5：search + limit 批处理后，AnalysisPipeline 可升级为读取 `results/mvp_output.jsonl` 并逐条生成 report/analysis（或批量聚合）
- Phase 3：OCR 实现后，把 `ocr_text` 接入 Knowledge Extract prompt
- 未来 FastAPI/Electron：AnalysisPipeline 的核心逻辑可下沉为 `services/analysis_service.py`，API 层只负责触发与流式日志

