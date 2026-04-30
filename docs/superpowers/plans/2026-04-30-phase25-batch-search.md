# Phase 2.5（批量 Search + KB 聚合）Implementation Plan

> **For agentic workers:** 需要按任务逐步执行并随时跑测试。Steps 使用 checkbox 追踪。

**Goal:** 在现有 dy/detail MVP + LLM 分析基础上，实现 search 模式批量抓取（Top N by liked_count）、批量处理（下载→ASR→LLM→输出到 run_dir）、断点续跑、dry-run 计划输出、以及跨视频 KB 聚合（kb_index/kb_tags/kb_summary）。

**Architecture:** 新增 BatchProcessor 作为编排层（并发/断点/重试/进度），复用既有 MVPPipeline + AnalysisPipeline 作为“单视频处理单元”，新增 KnowledgeBase 负责聚合本次 run_dir 下成功的 analysis 结果。CLI 仅负责参数解析与进入 batch 入口，保持 detail 模式兼容。

**Tech Stack:** Python, Typer, asyncio, PyYAML, pytest, 既有 services/pipelines 体系

---

## 文件结构（将创建/修改的文件）

**Create**
- `MediaCrawler/services/run_context.py`
- `MediaCrawler/services/search_reader.py`
- `MediaCrawler/services/batch_processor.py`
- `MediaCrawler/services/knowledge_base.py`
- `MediaCrawler/services/processed_registry.py`
- `MediaCrawler/tests/test_search_reader.py`
- `MediaCrawler/tests/test_batch_processor.py`
- `MediaCrawler/tests/test_knowledge_base.py`
- `MediaCrawler/tests/test_dry_run_plan.py`

**Modify**
- `MediaCrawler/config/base_config.py`
- `MediaCrawler/config/prompts.yaml`
- `MediaCrawler/cmd_arg/arg.py`
- `MediaCrawler/main.py`
- `MediaCrawler/pipelines/mvp_pipeline.py`
- `MediaCrawler/pipelines/analysis_pipeline.py`

---

### Task 1: CLI 参数扩展（type/keywords/limit/comment-depth/output-format/dry-run）

**Files:**
- Modify: `MediaCrawler/config/base_config.py`
- Modify: `MediaCrawler/cmd_arg/arg.py`
- Test: `MediaCrawler/tests/test_phase25_cli_args.py`

- [ ] **Step 1: 写失败测试（验证 parse_cmd 暴露新字段且默认值正确）**

Create `MediaCrawler/tests/test_phase25_cli_args.py`：

```python
import asyncio
import sys
import types


def _stub_tools_utils(monkeypatch):
    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)


def test_parse_cmd_has_phase25_fields(monkeypatch):
    _stub_tools_utils(monkeypatch)
    from cmd_arg import arg

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
            "3",
            "--comment-depth",
            "2",
            "--output-format",
            "all",
            "--dry-run",
            "true",
        ],
    )
    ns = asyncio.run(arg.parse_cmd())
    assert ns.type in ("search", "detail")
    assert ns.keywords == "AI教程"
    assert ns.limit == 3
    assert ns.comment_depth == 2
    assert ns.output_format == "all"
    assert ns.dry_run is True
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd MediaCrawler
pytest tests/test_phase25_cli_args.py -v
```

- [ ] **Step 3: 最小实现：base_config + arg.py**

1) `MediaCrawler/config/base_config.py` 新增默认值：

```python
BATCH_CONCURRENT_LIMIT = 3
BATCH_MAX_RETRIES = 3
BATCH_RETRY_DELAY_SECONDS = 2
```

2) `MediaCrawler/cmd_arg/arg.py` 新增 options 与回写：
- `--type`：覆盖 `config.CRAWLER_TYPE`（search/detail）
- `--keywords`：覆盖 `config.KEYWORDS`（兼容逗号分隔）
- `--limit`：返回到 namespace，不写入 config（仅 batch 用）
- `--comment-depth`：映射到 `config.ENABLE_GET_COMMENTS=True` + `config.ENABLE_GET_SUB_COMMENTS`（depth=2）
- `--output-format`：返回到 namespace
- `--dry-run`：返回 bool 到 namespace

校验规则：
- limit clamp：<1 设 1；>50 设 50
- comment-depth：非 1/2 则回退为 1

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_phase25_cli_args.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/config/base_config.py MediaCrawler/cmd_arg/arg.py MediaCrawler/tests/test_phase25_cli_args.py
git commit -m "feat(phase25): add batch/search cli args"
```

---

### Task 2: SearchReader（读取 search_contents_*.jsonl + TopN by liked_count）

**Files:**
- Create: `MediaCrawler/services/search_reader.py`
- Test: `MediaCrawler/tests/test_search_reader.py`

- [ ] **Step 1: 写失败测试**

`MediaCrawler/tests/test_search_reader.py`：

```python
import json
from pathlib import Path


def test_search_reader_topn(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    p = Path("data/douyin/jsonl")
    p.mkdir(parents=True, exist_ok=True)
    f = p / "search_contents_2099-01-01.jsonl"
    f.write_text(
        "\n".join(
            [
                json.dumps({"aweme_id": "1", "liked_count": "2", "aweme_url": "u1", "video_download_url": "d1", "source_keyword": "k"}, ensure_ascii=False),
                json.dumps({"aweme_id": "2", "liked_count": "10", "aweme_url": "u2", "video_download_url": "d2", "source_keyword": "k"}, ensure_ascii=False),
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    from services.search_reader import read_topn_search_results

    top = read_topn_search_results(limit=1)
    assert top[0].aweme_id == "2"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_search_reader.py -v
```

- [ ] **Step 3: 最小实现**

实现 `VideoCandidate`（dataclass）与：

```python
def read_topn_search_results(*, limit: int) -> list[VideoCandidate]
```

行为：
- 在 `data/douyin/jsonl/` 找最新的 `search_contents_*.jsonl`
- 读 JSONL，按 `int(liked_count)` 倒序
- 返回 Top N

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_search_reader.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/search_reader.py MediaCrawler/tests/test_search_reader.py
git commit -m "feat(phase25): add search reader and topn selection"
```

---

### Task 3: RunContext（run_id 生成 + run_dir 路径管理 + 文件命名规则）

**Files:**
- Create: `MediaCrawler/services/run_context.py`
- Test: `MediaCrawler/tests/test_run_context.py`

- [ ] **Step 1: 写失败测试**

```python
from services.run_context import RunContext


def test_run_context_paths(tmp_path):
    ctx = RunContext(run_root=tmp_path, run_id="20260422_103000_AI教程")
    p = ctx.output_path(kind="mvp_output", index=1, aweme_id="123")
    assert p.name == "mvp_output_001_123.json"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_run_context.py -v
```

- [ ] **Step 3: 最小实现**

`RunContext` 提供：
- `run_dir`
- `output_path(kind, index, aweme_id)`
- `processed_ids_path`
- `dry_run_plan_path`
- `kb_index_path / kb_tags_path / kb_summary_path`

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_run_context.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/run_context.py MediaCrawler/tests/test_run_context.py
git commit -m "feat(phase25): add run context and output naming"
```

---

### Task 4: ProcessedRegistry（processed_ids.jsonl 读写 + 跳过判定）

**Files:**
- Create: `MediaCrawler/services/processed_registry.py`
- Test: `MediaCrawler/tests/test_processed_registry.py`

- [ ] **Step 1: 写失败测试**

```python
from services.processed_registry import ProcessedRegistry


def test_registry_records_and_skips(tmp_path):
    p = tmp_path / "processed.jsonl"
    reg = ProcessedRegistry(path=p)
    assert reg.is_processed("1") is False
    reg.append_success("1")
    assert reg.is_processed("1") is True
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_processed_registry.py -v
```

- [ ] **Step 3: 最小实现**

实现：
- `append_success(aweme_id)`
- `append_failed(aweme_id, failed_stage, error_code)`
- `is_processed(aweme_id)`（读文件索引或启动时 preload）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_processed_registry.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/processed_registry.py MediaCrawler/tests/test_processed_registry.py
git commit -m "feat(phase25): add processed ids registry"
```

---

### Task 5: BatchProcessor（并发/重试/进度/dry-run）

**Files:**
- Create: `MediaCrawler/services/batch_processor.py`
- Test: `MediaCrawler/tests/test_batch_processor.py`
- Test: `MediaCrawler/tests/test_dry_run_plan.py`

- [ ] **Step 1: 写失败测试（dry-run 只生成计划文件）**

`MediaCrawler/tests/test_dry_run_plan.py`：

```python
import asyncio
import json

from services.run_context import RunContext
from services.search_reader import VideoCandidate


def test_dry_run_writes_plan(tmp_path):
    ctx = RunContext(run_root=tmp_path, run_id="r")
    candidates = [
        VideoCandidate(aweme_id="2", aweme_url="u2", video_download_url="d2", liked_count=10, source_keyword="k"),
        VideoCandidate(aweme_id="1", aweme_url="u1", video_download_url="d1", liked_count=2, source_keyword="k"),
    ]

    from services.batch_processor import BatchProcessor

    bp = BatchProcessor(run_context=ctx)
    asyncio.run(bp.run(candidates=candidates, limit=1, dry_run=True))
    plan = json.loads(ctx.dry_run_plan_path().read_text(encoding="utf-8"))
    assert plan["will_process_top_n"] == 1
    assert plan["plan"][0]["aweme_id"] == "2"
```

- [ ] **Step 2: 写失败测试（断点续跑：已存在 analysis 文件则跳过）**

`MediaCrawler/tests/test_batch_processor.py`：

```python
import asyncio

from services.run_context import RunContext
from services.search_reader import VideoCandidate


class _FakeSingleRunner:
    def __init__(self):
        self.calls = 0

    async def run_one(self, **kwargs):
        self.calls += 1
        return {"status": "success"}


def test_batch_skips_existing(tmp_path):
    ctx = RunContext(run_root=tmp_path, run_id="r")
    ctx.run_dir().mkdir(parents=True, exist_ok=True)
    ctx.output_path(kind="mvp_analysis", index=1, aweme_id="1").write_text("{}", encoding="utf-8")

    candidates = [VideoCandidate(aweme_id="1", aweme_url="u1", video_download_url="d1", liked_count=2, source_keyword="k")]
    fake = _FakeSingleRunner()

    from services.batch_processor import BatchProcessor

    bp = BatchProcessor(run_context=ctx, single_runner=fake)
    asyncio.run(bp.run(candidates=candidates, limit=1, dry_run=False))
    assert fake.calls == 0
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_dry_run_plan.py -v
pytest tests/test_batch_processor.py -v
```

- [ ] **Step 4: 最小实现 BatchProcessor**

实现建议拆成两个层次：
- `BatchProcessor.run()`：排序/limit/skip/dry-run/调度
- `SingleVideoRunner.run_one()`：对一个 candidate 执行：
  - 运行 MVPPipeline（输出到 run_dir 的 mvp_output_001_<id>.json）
  - 运行 AnalysisPipeline（输出到 run_dir 的 mvp_analysis / mvp_report）

并发：
- `asyncio.Semaphore(concurrent_limit)`
- 每个视频 `asyncio.create_task`，收集结果

重试：
- 对 LLM 阶段（或整体 run_one）做 `max_retries` + `retry_delay`

进度输出：
- `progress_callback`（若 None 则 print）

- [ ] **Step 5: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_dry_run_plan.py -v
pytest tests/test_batch_processor.py -v
```

- [ ] **Step 6: Commit**

```bash
cd /workspace
git add MediaCrawler/services/batch_processor.py MediaCrawler/tests/test_batch_processor.py MediaCrawler/tests/test_dry_run_plan.py
git commit -m "feat(phase25): add batch processor with dry-run and resume"
```

---

### Task 6: 让 pipeline 支持“可注入输入/输出路径”（为批量输出服务）

**Files:**
- Modify: `MediaCrawler/pipelines/mvp_pipeline.py`
- Modify: `MediaCrawler/pipelines/analysis_pipeline.py`
- Test: `MediaCrawler/tests/test_pipeline_paths.py`

- [ ] **Step 1: 写失败测试（可覆盖 output 路径）**

`MediaCrawler/tests/test_pipeline_paths.py`：

```python
import asyncio
import json
from pathlib import Path


def test_analysis_pipeline_custom_paths(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    Path("in").mkdir()
    Path("out").mkdir()
    in_file = Path("in/mvp_output.json")
    in_file.write_text(json.dumps({"video_url": "u", "transcript": "t"}, ensure_ascii=False), encoding="utf-8")

    class _FakeAnalyzer:
        async def analyze(self, **kwargs):
            return {"status": "success", "comment_value_judge": {"items": []}, "knowledge_points": [], "suggestions": []}

    from pipelines.analysis_pipeline import AnalysisPipeline

    p = AnalysisPipeline(
        analyzer=_FakeAnalyzer(),
        input_mvp_output_file=in_file,
        output_analysis_file=Path("out/a.json"),
        output_report_file=Path("out/r.md"),
    )
    asyncio.run(p.run(model="m", api_base="b", api_key="k"))
    assert Path("out/a.json").exists()
    assert Path("out/r.md").exists()
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_pipeline_paths.py -v
```

- [ ] **Step 3: 实现/调整**

- `MVPPipelineConfig.results_file` 已支持注入；需要确保 BatchProcessor 调用时传入
- `AnalysisPipeline` 当前已支持注入 input/output path；补齐单测并修正不一致处

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_pipeline_paths.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/pipelines/mvp_pipeline.py MediaCrawler/pipelines/analysis_pipeline.py MediaCrawler/tests/test_pipeline_paths.py
git commit -m "refactor(phase25): make pipelines support custom io paths"
```

---

### Task 7: KnowledgeBase（kb_index/kb_tags/kb_summary + 规则降级）

**Files:**
- Modify: `MediaCrawler/config/prompts.yaml`
- Create: `MediaCrawler/services/knowledge_base.py`
- Test: `MediaCrawler/tests/test_knowledge_base.py`

- [ ] **Step 1: 写失败测试（规则聚合输出）**

`MediaCrawler/tests/test_knowledge_base.py`：

```python
import json
from pathlib import Path


def test_kb_aggregates_success_only(tmp_path):
    run_dir = tmp_path / "runs/r"
    run_dir.mkdir(parents=True, exist_ok=True)

    (run_dir / "mvp_analysis_001_1.json").write_text(
        json.dumps({"status": "success", "video_url": "u1", "knowledge_points": [{"title": "t1", "content": "c1", "timestamp": "00:00:01.000"}], "comment_value_judge": {"items": [{"tags": ["#a"]}]}}, ensure_ascii=False),
        encoding="utf-8",
    )
    (run_dir / "mvp_analysis_002_2.json").write_text(
        json.dumps({"status": "error"}, ensure_ascii=False),
        encoding="utf-8",
    )

    from services.knowledge_base import KnowledgeBase

    kb = KnowledgeBase(run_dir=run_dir, run_id="r")
    kb.build(use_llm=False)

    assert (run_dir / "kb_index_r.jsonl").exists()
    assert (run_dir / "kb_tags_r.json").exists()
    assert (run_dir / "kb_summary_r.md").exists()
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_knowledge_base.py -v
```

- [ ] **Step 3: 最小实现**

- 读取 `mvp_analysis_*.json`
- 过滤 `status!="success"`
- 生成：
  - kb_index（jsonl）
  - kb_tags（统计 tags）
  - kb_summary（规则降级模板）

并在 `config/prompts.yaml` 新增：
- `kb_aggregation_template`
- `kb_aggregation_fallback`

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_knowledge_base.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/config/prompts.yaml MediaCrawler/services/knowledge_base.py MediaCrawler/tests/test_knowledge_base.py
git commit -m "feat(phase25): add knowledge base aggregation outputs"
```

---

### Task 8: main.py 串联 search 批量入口（保持 detail 兼容）

**Files:**
- Modify: `MediaCrawler/main.py`
- Test: `MediaCrawler/tests/test_phase25_entry.py`

- [ ] **Step 1: 写失败测试（dry-run 入口能生成 run_dir 计划文件）**

`MediaCrawler/tests/test_phase25_entry.py`：

```python
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
        json.dumps({"aweme_id": "1", "liked_count": "2", "aweme_url": "u1", "video_download_url": "d1", "source_keyword": "AI教程"}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)

    monkeypatch.setattr(
        sys,
        "argv",
        ["main.py", "--platform", "dy", "--pipeline", "mvp", "--type", "search", "--keywords", "AI教程", "--limit", "1", "--dry-run", "true"],
    )

    import main as main_mod

    asyncio.run(main_mod.main())
    runs = Path("results/runs")
    assert runs.exists()
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_phase25_entry.py -v
```

- [ ] **Step 3: 实现 main 入口分支**

当 `--pipeline mvp` 且 `--type search`：
- 读取 search topN candidates
- 构造 run_id + RunContext
- 调用 BatchProcessor（dry-run 或真实执行）
- 结束后调用 KnowledgeBase.build（排除失败条目）

同时保持：
- 不传 `--type` 时仍走现有 detail 单条路径

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_phase25_entry.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/main.py MediaCrawler/tests/test_phase25_entry.py
git commit -m "feat(phase25): add search batch entry and kb generation"
```

---

### Task 9: 汇总测试 + 推送

**Files:**
- (无新增文件)

- [ ] **Step 1: 运行 Phase 2 + Phase 2.5 相关测试**

```bash
cd MediaCrawler
pytest -q \
  tests/test_mvp_pipeline.py \
  tests/test_llm_prompts.py tests/test_llm_prompts_loader.py tests/test_llm_client.py tests/test_llm_cache.py tests/test_llm_analyzer.py \
  tests/test_report_renderer.py tests/test_analysis_pipeline.py tests/test_cli_llm_flags.py \
  tests/test_phase25_cli_args.py tests/test_search_reader.py tests/test_run_context.py tests/test_processed_registry.py \
  tests/test_dry_run_plan.py tests/test_batch_processor.py tests/test_knowledge_base.py tests/test_phase25_entry.py
```

- [ ] **Step 2: 推送分支**

```bash
cd /workspace
git push origin trae/solo-agent-M3pw1t
```

