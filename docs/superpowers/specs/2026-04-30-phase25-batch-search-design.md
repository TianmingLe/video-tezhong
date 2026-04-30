# Phase 2.5：批量抓取 + Search 模式 + --limit（方案 B）设计文档

## 1. 概述

### 1.1 目标

在现有 MVP Pipeline（下载→ASR→mvp_output）与 LLM 分析（analysis_pipeline→mvp_analysis/mvp_report）的基础上，实现完整链路：

**关键词搜索 → 批量抓取 → 批量分析 → 知识库聚合（KB）**

并具备：

- Search / Detail 双模式（默认 detail，向后兼容）
- `--limit` 控制 Top N 视频
- 并发控制 + 断点续跑 + 失败降级 + 进度输出
- 单次 run 独立输出目录（run_id 目录 + aweme_id 文件名）
- KB 聚合输出：`kb_summary.md` / `kb_index.jsonl` / `kb_tags.json`
- dry-run：仅模拟，不下载、不 ASR、不 LLM

### 1.2 范围（本次要做）

- CLI 参数扩展：
  - `--type search|detail`
  - `--keywords`
  - `--limit`
  - `--comment-depth`
  - `--output-format`
  - `--dry-run`
- Search 模式读取 `search_contents_*.jsonl` 并按 `liked_count` 排序取 Top N
- 新增批量处理编排层：
  - `services/batch_processor.py`
  - `services/knowledge_base.py`
- run 输出目录组织与文件命名（runs/<run_id>/...）
- 断点续跑记录文件：`processed_ids.jsonl`
- KB 聚合支持一次额外 LLM 调用（可配置 prompt），失败则规则降级

### 1.3 非目标（本次不做）

- OCR（PaddleOCR）完整实现（仅保留接口扩展点）
- Electron/FastAPI/WebSocket UI（BatchProcessor 仅预留 progress callback）
- 多平台（先聚焦 dy）
- 评论多级深度（当前只支持二级评论，comment-depth 只映射 1/2）

---

## 2. CLI 参数设计

### 2.1 参数详表

| 参数 | 类型 | 默认值 | 约束/校验 | 说明 |
|------|------|--------|-----------|------|
| `--pipeline` | str | `""` | `mvp` 触发 pipeline 分支 | 维持现有行为 |
| `--type` | str | `detail` | `search`/`detail` | Phase 2.5 新增，默认 detail 保持兼容 |
| `--keywords` | str | 继承现有 config.KEYWORDS | 支持逗号分隔 | search 模式输入关键词 |
| `--limit` | int | `1` | `1 <= limit <= 50` | Top N 视频数量 |
| `--comment-depth` | int | `1` | `1` 或 `2` | 1=仅一级评论；2=一级+二级 |
| `--output-format` | str | `all` | `jsonl`/`markdown`/`all` | 控制输出文件种类 |
| `--dry-run` | str | `false` | 支持 yes/true/t/y/1 | 仅模拟流程并输出计划文件 |
| `--enable-llm` | str | `false` | 兼容布尔字符串 | 已实现：控制是否执行 AnalysisPipeline |
| `--llm-model` | str | `""` | enable-llm 时必填 | 用户输入模型名 |
| `--llm-base-url` | str | `""` | enable-llm 时必填 | OpenAI 兼容 base_url（通常 /v1） |

### 2.2 comment-depth 映射规则

系统当前只支持二级评论开关，因此映射为：

- `comment-depth=1`：
  - `config.ENABLE_GET_COMMENTS=True`
  - `config.ENABLE_GET_SUB_COMMENTS=False`
- `comment-depth=2`：
  - `config.ENABLE_GET_COMMENTS=True`
  - `config.ENABLE_GET_SUB_COMMENTS=True`

若用户显式传了 `--get_sub_comment`（已有参数），建议优先级：

1. `--comment-depth` 优先（覆盖 get_sub_comment）
2. 未提供 comment-depth 时沿用 get_sub_comment

### 2.3 示例命令（验收）

search 批量：

```bash
python main.py --platform dy --pipeline mvp --type search \
  --keywords "AI教程" --limit 3 --enable-llm true \
  --llm-model "gpt-4o" --llm-base-url "https://api.openai.com/v1"
```

dry-run：

```bash
python main.py --platform dy --pipeline mvp --type search \
  --keywords "AI教程" --limit 3 --dry-run true
```

---

## 3. 数据来源与排序（Search 模式）

### 3.1 搜索落盘文件

抖音 search 模式内容落盘为：

- `data/douyin/jsonl/search_contents_YYYY-MM-DD.jsonl`

若配置 `config.SAVE_DATA_PATH`，则改为：

- `{SAVE_DATA_PATH}/douyin/jsonl/search_contents_YYYY-MM-DD.jsonl`

### 3.2 关键字段

每行对象包含（节选）：

- `aweme_id`
- `aweme_url`
- `video_download_url`
- `liked_count`（字符串，来源 statistics.digg_count）
- `source_keyword`

### 3.3 Top N 规则

按 `liked_count`（转换为 int）倒序排序，取 Top `--limit`。

---

## 4. 输出目录与文件命名（run_id）

### 4.1 run_id 规范

`run_id = <YYYYMMDD_HHMMSS>_<keyword>`

- keyword 取用户输入关键词列表中的第一个关键词
- keyword 需要做文件名安全化（移除空格/斜杠等）

### 4.2 目录结构

```
results/runs/<run_id>/
├── dry_run_plan_<run_id>.json
├── processed_ids_<run_id>.jsonl
├── mvp_output_001_<aweme_id>.json
├── mvp_analysis_001_<aweme_id>.json
├── mvp_report_001_<aweme_id>.md
├── ...
├── kb_index_<run_id>.jsonl
├── kb_tags_<run_id>.json
└── kb_summary_<run_id>.md
```

### 4.3 output-format 行为

- `all`：产出所有文件
- `jsonl`：写 `mvp_output*.json`、`mvp_analysis*.json`、`kb_index*.jsonl`、`kb_tags*.json`、（可选）`processed_ids*.jsonl`；不写 md
- `markdown`：写 `mvp_report*.md`、`kb_summary*.md`；其余结构化文件仍可在内部生成但不落盘（或落盘最小索引用于断点续跑）

---

## 5. BatchProcessor 设计（services/batch_processor.py）

### 5.1 职责

批量编排层，负责：

- search 列表生成（或接收外部 list）
- Top N 选择
- 并发控制（concurrent_limit）
- 断点续跑（跳过已处理 aweme_id）
- 逐视频处理（下载→ASR→LLM→输出）
- 进度回调（未来可推送 WebSocket）

### 5.2 输入输出（接口草案）

```python
class BatchProcessor:
    async def run(
        self,
        *,
        run_id: str,
        candidates: list[VideoCandidate],
        limit: int,
        concurrent_limit: int,
        dry_run: bool,
        output_format: str,
        enable_llm: bool,
        llm_model: str,
        llm_base_url: str,
        llm_api_key: str,
        max_retries: int,
        retry_delay: float,
        progress_callback: Callable[[ProgressEvent], None] | None,
    ) -> BatchRunResult: ...
```

其中：

- `VideoCandidate`：`aweme_id, aweme_url, video_download_url, liked_count, source_keyword`
- `ProgressEvent`：`index, total, aweme_id, stage, status, message`

### 5.3 断点续跑：processed_ids.jsonl

文件：`results/runs/<run_id>/processed_ids_<run_id>.jsonl`

每行：

```json
{
  "aweme_id": "7350123456789012345",
  "status": "success|failed",
  "failed_stage": "download|asr|llm",
  "error_code": "YT_DLP_TIMEOUT|WHISPER_OOM|LLM_429",
  "timestamp": "2026-04-22T10:30:00Z"
}
```

跳过规则：

- 若 run_dir 已存在 `mvp_analysis_*_<aweme_id>.json` 或 processed_ids 中 `status=success`，则跳过
- `status=failed` 的条目默认允许重试（可在未来加 `--resume-mode skip_failed|retry_failed`）

### 5.4 dry-run 输出：dry_run_plan.json

文件：`results/runs/<run_id>/dry_run_plan_<run_id>.json`

示例：

```json
{
  "total_candidates": 47,
  "will_process_top_n": 3,
  "skipped_already_processed": 0,
  "estimated_time_minutes": null,
  "estimated_token_cost": null,
  "plan": [
    {"aweme_id": "xxx", "liked_count": 12000, "reason": "Top 1"},
    {"aweme_id": "yyy", "liked_count": 8500, "reason": "Top 2"}
  ]
}
```

约束：dry-run 不下载、不 ASR、不 LLM，不生成 mvp_output/mvp_report/mvp_analysis。

---

## 6. 单视频处理链路（复用既有 Pipeline）

每个视频的“处理单元”由两段组成：

1. `MVPPipeline`：
   - 输入：`specified_id`（aweme_url 或 aweme_id）
   - 输出：`mvp_output_XXX_<aweme_id>.json`
   - 保持“分析完即删除本地视频文件”的行为

2. `AnalysisPipeline`（enable-llm=true 时）：
   - 输入：读取该视频对应的 mvp_output 文件
   - 输出：`mvp_analysis_XXX_<aweme_id>.json` 与 `mvp_report_XXX_<aweme_id>.md`

Phase 2.5 需要支持“每个视频单独 output 路径”，因此建议将：

- `MVPPipelineConfig.results_file` 与 `AnalysisPipeline.input/output 文件路径`

改为可由 BatchProcessor 在每个视频任务启动前注入。

---

## 7. KnowledgeBase 聚合（services/knowledge_base.py）

### 7.1 输入

- run_dir 下所有 `mvp_analysis_*.json`
- 过滤规则：`status != success` 或 `analysis_status=failed` 的条目排除

### 7.2 输出

1) `kb_index_<run_id>.jsonl`

每行（建议字段）：

```json
{
  "aweme_id": "xxx",
  "video_url": "https://www.douyin.com/video/xxx",
  "source_keyword": "AI教程",
  "knowledge_points": [{"title":"...","content":"...","timestamp":"..."}],
  "tags": ["#运营技巧"],
  "analysis_file": "mvp_analysis_001_xxx.json",
  "report_file": "mvp_report_001_xxx.md"
}
```

2) `kb_tags_<run_id>.json`

```json
{
  "#运营技巧": 3,
  "#剪辑教程": 2
}
```

3) `kb_summary_<run_id>.md`

必须包含：

- 聚合知识点（去重/分类）
- 标签体系摘要
- 与本次 run 的视频列表索引

### 7.3 LLM 聚合（一次额外调用）

在 `prompts.yaml` 新增：

- `kb_aggregation_template`：LLM 聚合 prompt
- `kb_aggregation_fallback`：规则降级模板（用于写入 md）

LLM 失败时降级规则（建议实现）：

1. 按知识点 title 分组去重（文本相似度>0.85 视为重复）
2. 按出现频次排序，取 Top 20
3. 标签统计：取出现 ≥ 2 的标签
4. 固定 Markdown 结构输出

---

## 8. 配置增强

### 8.1 base_config.py

新增：

- `BATCH_CONCURRENT_LIMIT = 3`
- `BATCH_MAX_RETRIES = 3`
- `BATCH_RETRY_DELAY_SECONDS = 2`

### 8.2 llm_config.yaml

新增：

- `batch_prompt_template`（可选，未来做“一次性分析多个视频”优化）

---

## 9. 错误码（建议集合）

按 stage 分类（写入 processed_ids 与各 video 的 output 文件）：

- download：
  - `ERR_DOWNLOAD_TIMEOUT`
  - `ERR_DOWNLOAD_FAILED`
- asr：
  - `ERR_ASR_DEPENDENCY_MISSING`
  - `ERR_ASR_TRANSCRIBE_FAILED`
- llm：
  - `ERR_LLM_CONFIG_INVALID`
  - `ERR_LLM_AUTH`
  - `ERR_LLM_TIMEOUT`
  - `ERR_LLM_FAILED`
- kb：
  - `ERR_KB_AGGREGATION_FAILED`（LLM 失败后仍应输出 fallback）

---

## 10. 测试用例清单（TDD）

至少覆盖：

1) search 结果读取与 TopN 排序（liked_count 转 int，limit 上限校验）
2) BatchProcessor：
   - 并发上限有效（可用计数器 + semaphore 断言）
   - 断点续跑：已有 mvp_analysis 文件时跳过
   - 单视频失败不影响其他视频（输出 processed_ids，最终仍生成 kb）
   - dry-run：只生成 dry_run_plan，不生成视频产物
3) KnowledgeBase：
   - 过滤失败条目
   - kb_index/kb_tags 输出结构正确
   - kb_summary 规则降级输出结构正确

---

## 11. 验收标准

### 11.1 命令与输出

```bash
python main.py --platform dy --pipeline mvp --type search \
  --keywords "AI教程" --limit 3 --enable-llm true \
  --llm-model "gpt-4o" --llm-base-url "https://api.openai.com/v1"
```

期望：

- 生成 `results/runs/<run_id>/`
- 产出 3 组单视频结果：
  - `mvp_output_001_<aweme_id>.json` ~ `mvp_output_003_<aweme_id>.json`
  - `mvp_report_001_<aweme_id>.md` ~ `mvp_report_003_<aweme_id>.md`
  - `mvp_analysis_001_<aweme_id>.json` ~ `mvp_analysis_003_<aweme_id>.json`
- 产出聚合：
  - `kb_summary_<run_id>.md`
  - `kb_index_<run_id>.jsonl`
  - `kb_tags_<run_id>.json`

### 11.2 终端日志

必须出现类似：

```
[INFO] 搜索关键词: "AI教程", 找到 47 个视频
[INFO] 按点赞排序，取 Top 3 进行处理
[PROGRESS] 视频 1/3: 下载→ASR→LLM 完成 ✅
[PROGRESS] 视频 2/3: 下载→ASR→LLM 完成 ✅
[PROGRESS] 视频 3/3: 下载→ASR→LLM 完成 ✅
[SUCCESS] 知识库聚合完成: results/runs/<run_id>/kb_summary_<run_id>.md
```

### 11.3 断点续跑

二次执行同 run_id（或指定 resume 策略）时：

- 已处理视频自动跳过
- 日志输出跳过原因

### 11.4 失败降级

- 某视频下载失败：记录 processed_ids（failed_stage=download），继续下一个
- LLM 超时：重试 3 次后标记 failed_stage=llm，并在 KB 聚合时排除
- kb_summary 聚合时：
  - LLM 聚合失败仍要输出 fallback kb_summary

