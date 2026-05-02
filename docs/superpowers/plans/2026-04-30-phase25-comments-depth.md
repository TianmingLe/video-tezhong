# Phase 2.5（comment-depth=2 评论深度分析）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 detail/批量两种模式下，将抖音评论（一级+二级）以“缓存优先、force 才重抓”的策略接入 `SingleVideoRunner → LLMAnalyzer`，产出 `valuable_comments + community_insights` 并增强报告与 KB 输出，同时保持 comments=None 的向后兼容。

**Architecture:** 增加 `CommentProcessor` 负责从 comments JSONL/在线抓取结果构建 thread tree（TopM/TopK）并做长度截断；`SingleVideoRunner` 在 enable comments 时决策 cache/online 并将结构化 comments 传给 `AnalysisPipeline/LLMAnalyzer`；LLM 侧保持 `comment_value_judge.items[]` 输出不变，后处理生成 `valuable_comments`，并新增一次 `community_insights` 调用；最终增强 report_renderer 与 KnowledgeBase 的输出结构。

**Tech Stack:** Python, Typer, asyncio, pytest, LiteLLM(OpenAI-compatible), JSONL file IO

---

## 文件结构（将创建/修改的文件）

**Create**
- `MediaCrawler/services/comment_processor.py`
- `MediaCrawler/tests/test_comment_processor.py`
- `MediaCrawler/tests/test_llm_analyzer_with_comments.py`
- `MediaCrawler/tests/test_report_renderer_comments.py`
- `MediaCrawler/tests/test_knowledge_base_comments.py`
- `MediaCrawler/tests/test_single_video_runner_comment_flow.py`

**Modify**
- `MediaCrawler/config/base_config.py`
- `MediaCrawler/cmd_arg/arg.py`
- `MediaCrawler/config/prompts.yaml`
- `MediaCrawler/services/llm_analyzer.py`
- `MediaCrawler/pipelines/analysis_pipeline.py`
- `MediaCrawler/services/report_renderer.py`
- `MediaCrawler/services/knowledge_base.py`
- `MediaCrawler/services/single_video_runner.py`
- `MediaCrawler/services/processed_registry.py`

---

### Task 1: CLI 参数与默认配置（top-comments/top-replies/force-regrab）

**Files:**
- Modify: `MediaCrawler/config/base_config.py`
- Modify: `MediaCrawler/cmd_arg/arg.py`
- Test: `MediaCrawler/tests/test_phase25_comments_cli_args.py`

- [ ] **Step 1: 写失败测试**

Create `MediaCrawler/tests/test_phase25_comments_cli_args.py`：

```python
import asyncio
import sys
import types


def _stub_tools_utils(monkeypatch):
    fake_tools_utils = types.ModuleType("tools.utils")
    fake_tools_utils.str2bool = lambda v: str(v).lower() in ("1", "true", "t", "yes", "y")
    monkeypatch.setitem(sys.modules, "tools.utils", fake_tools_utils)


def test_parse_cmd_has_comment_tuning_fields(monkeypatch):
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
            "--specified_id",
            "x",
            "--comment-depth",
            "2",
            "--top-comments",
            "10",
            "--top-replies",
            "3",
            "--force-regrab",
            "true",
        ],
    )
    ns = asyncio.run(arg.parse_cmd())
    assert ns.top_comments == 10
    assert ns.top_replies == 3
    assert ns.force_regrab is True
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd MediaCrawler
pytest tests/test_phase25_comments_cli_args.py -v
```

- [ ] **Step 3: 最小实现**

1) `MediaCrawler/config/base_config.py` 新增：

```python
TOP_COMMENTS_LIMIT = 20
TOP_REPLIES_LIMIT = 5
```

2) `MediaCrawler/cmd_arg/arg.py` 新增 options，并将结果塞入 namespace：
- `--top-comments`（int）
- `--top-replies`（int）
- `--force-regrab`（bool string → bool）

注意：comment-depth 仍保留既有映射（depth=1/2 会强制 enable comments/sub-comments）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_phase25_comments_cli_args.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/config/base_config.py MediaCrawler/cmd_arg/arg.py MediaCrawler/tests/test_phase25_comments_cli_args.py
git commit -m "feat(comments): add top comments/replies and force regrab flags"
```

---

### Task 2: CommentProcessor（JSONL → thread tree + 截断）

**Files:**
- Create: `MediaCrawler/services/comment_processor.py`
- Test: `MediaCrawler/tests/test_comment_processor.py`

- [ ] **Step 1: 写失败测试（构树 + TopM/TopK）**

Create `MediaCrawler/tests/test_comment_processor.py`：

```python
from services.comment_processor import CommentProcessor


def test_comment_processor_tree_and_topk():
    raw = [
        {"aweme_id": "a", "comment_id": "c1", "content": "root1", "like_count": 10, "parent_comment_id": "0", "nickname": "u1"},
        {"aweme_id": "a", "comment_id": "c2", "content": "root2", "like_count": 20, "parent_comment_id": "0", "nickname": "u2"},
        {"aweme_id": "a", "comment_id": "s1", "content": "reply1", "like_count": 5, "parent_comment_id": "c2", "nickname": "u3"},
        {"aweme_id": "a", "comment_id": "s2", "content": "reply2", "like_count": 9, "parent_comment_id": "c2", "nickname": "u4"},
    ]

    out = CommentProcessor().build(raw_comments=raw, top_comments=1, top_replies=1, budget_chars=10_000)
    assert out["stats"]["total_comments"] == 4
    assert out["root_comments"][0]["content"] == "root2"
    assert len(out["root_comments"][0]["replies"]) == 1
    assert out["root_comments"][0]["replies"][0]["content"] == "reply2"
```

- [ ] **Step 2: 写失败测试（截断触发）**

追加到同文件：

```python
def test_comment_processor_truncates_when_budget_small():
    raw = [
        {"aweme_id": "a", "comment_id": "c1", "content": "x" * 5000, "like_count": 10, "parent_comment_id": "0", "nickname": "u1"},
    ]
    out = CommentProcessor().build(raw_comments=raw, top_comments=1, top_replies=0, budget_chars=100)
    assert out["stats"]["truncated"] is True
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_comment_processor.py -v
```

- [ ] **Step 4: 最小实现 CommentProcessor**

Create `MediaCrawler/services/comment_processor.py`：

```python
import json
from typing import Any, Dict, List


class CommentProcessor:
    def build(self, *, raw_comments: List[Dict[str, Any]], top_comments: int, top_replies: int, budget_chars: int) -> Dict[str, Any]:
        ...
```

实现要点：
- root = `parent_comment_id == "0"`；replies 按 `parent_comment_id` 分组
- root 按 `like_count` 倒序取 top_comments
- replies 按 `like_count` 倒序取 top_replies
- 截断：循环减少 root 数量→减少 replies 数量→截断 content（每条最大 N 字符），直到 `len(json.dumps(out, ensure_ascii=False)) <= budget_chars`
- stats 输出：`total_comments/total_root_comments/total_replies/top_comment_likes/truncated`

- [ ] **Step 5: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_comment_processor.py -v
```

- [ ] **Step 6: Commit**

```bash
cd /workspace
git add MediaCrawler/services/comment_processor.py MediaCrawler/tests/test_comment_processor.py
git commit -m "feat(comments): add comment processor tree and truncation"
```

---

### Task 3: LLMAnalyzer 增强（comments 参数 + valuable_comments 后处理 + community_insights）

**Files:**
- Modify: `MediaCrawler/services/llm_analyzer.py`
- Modify: `MediaCrawler/config/prompts.yaml`
- Test: `MediaCrawler/tests/test_llm_analyzer_with_comments.py`

- [ ] **Step 1: 写失败测试（comments 注入 + valuable_comments 过滤 + community_insights）**

Create `MediaCrawler/tests/test_llm_analyzer_with_comments.py`：

```python
import asyncio

from services.llm_client import LLMResult
from services.llm_prompts import PromptStore, PromptTemplate


class _FakeClient:
    def __init__(self):
        self.calls = 0

    async def chat(self, **kwargs):
        self.calls += 1
        if self.calls == 1:
            return LLMResult(
                text='[{"comment_text":"a","is_valuable":true,"tags":["#t"],"reason":"r"},{"comment_text":"b","is_valuable":false,"tags":[],"reason":"x"}]',
                usage={"total_tokens": 5},
                cost_usd=0.0,
            )
        if self.calls == 2:
            return LLMResult(text='{"consensus":["c1"],"controversy":["v1"]}', usage={"total_tokens": 3}, cost_usd=0.0)
        return LLMResult(text='[{"title":"k","content":"c","timestamp":"00:00:01.000"}]', usage={"total_tokens": 7}, cost_usd=0.0)


def test_analyzer_comments_flow():
    store = PromptStore(
        {
            "comment_value_judge": PromptTemplate(system="s", user="{video_topic}{comments_json}"),
            "community_insights": PromptTemplate(system="s", user="{video_topic}{comments_json}"),
            "knowledge_extract": PromptTemplate(system="s", user="{transcript}{ocr_text}{valuable_comments_json}"),
        }
    )

    from services.llm_analyzer import LLMAnalyzer

    analyzer = LLMAnalyzer(prompt_store=store, llm_client=_FakeClient(), cache=None)
    out = asyncio.run(
        analyzer.analyze(
            model="m",
            api_base="b",
            api_key="k",
            video_topic="t",
            transcript="x",
            comments={"root_comments": [{"content": "a"}], "stats": {"total_comments": 1}},
            ocr_text="",
        )
    )

    assert out["community_insights"]["consensus"] == ["c1"]
    assert len(out["valuable_comments"]) == 1
    assert out["valuable_comments"][0]["comment_text"] == "a"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_llm_analyzer_with_comments.py -v
```

- [ ] **Step 3: 最小实现**

1) 修改 `LLMAnalyzer.analyze(..., comments: Optional[dict], ...)`
- comments None：保持旧逻辑
- comments 有值：
  - `comment_value_judge` 的 `comments_json` 用结构化评论
  - `community_insights` 单独调用并解析 JSON
  - valuable_comments 后处理过滤
  - `knowledge_extract` 增加 `valuable_comments_json`

2) 修改 `config/prompts.yaml`
- 更新 `comment_value_judge.user` 语义（输入为评论树）
- 新增 `community_insights` 模板
- 更新 `knowledge_extract.user` 增加 `{valuable_comments_json}`

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_llm_analyzer_with_comments.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/llm_analyzer.py MediaCrawler/config/prompts.yaml MediaCrawler/tests/test_llm_analyzer_with_comments.py
git commit -m "feat(comments): wire comments into llm analyzer and add community insights"
```

---

### Task 4: AnalysisPipeline 透传 comments（从 mvp_output 中读取或由 runner 直接传入）

**Files:**
- Modify: `MediaCrawler/pipelines/analysis_pipeline.py`
- Test: `MediaCrawler/tests/test_analysis_pipeline_comments.py`

- [ ] **Step 1: 写失败测试（analysis_pipeline 读取 mvp_output.comments 并传给 analyzer）**

Create `MediaCrawler/tests/test_analysis_pipeline_comments.py`：

```python
import asyncio
import json
from pathlib import Path


def test_analysis_pipeline_passes_comments(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    Path("in").mkdir()
    Path("out").mkdir()
    Path("in/mvp_output.json").write_text(
        json.dumps({"video_url": "u", "transcript": "t", "comments": {"root_comments": [], "stats": {"total_comments": 0}}}, ensure_ascii=False),
        encoding="utf-8",
    )

    class _FakeAnalyzer:
        def __init__(self):
            self.seen = None

        async def analyze(self, **kwargs):
            self.seen = kwargs.get("comments")
            return {"status": "success", "comment_value_judge": {"items": []}, "knowledge_points": [], "suggestions": []}

    from pipelines.analysis_pipeline import AnalysisPipeline

    a = _FakeAnalyzer()
    p = AnalysisPipeline(
        analyzer=a,
        input_mvp_output_file=Path("in/mvp_output.json"),
        output_analysis_file=Path("out/a.json"),
        output_report_file=Path("out/r.md"),
    )
    asyncio.run(p.run(model="m", api_base="b", api_key="k"))
    assert a.seen is not None
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_analysis_pipeline_comments.py -v
```

- [ ] **Step 3: 最小实现**

在 `analysis_pipeline.py` 中读取：
- `comments = mvp.get("comments")`
并将其传给 `analyzer.analyze(..., comments=comments, ...)`。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_analysis_pipeline_comments.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/pipelines/analysis_pipeline.py MediaCrawler/tests/test_analysis_pipeline_comments.py
git commit -m "feat(comments): pass structured comments through analysis pipeline"
```

---

### Task 5: SingleVideoRunner 接入评论链路（cache 优先 + force 重抓 + 写入 mvp_output.comments）

**Files:**
- Modify: `MediaCrawler/services/single_video_runner.py`
- Modify: `MediaCrawler/services/processed_registry.py`
- Test: `MediaCrawler/tests/test_single_video_runner_comment_flow.py`

- [ ] **Step 1: 写失败测试（cache 优先/force 重抓的决策）**

Create `MediaCrawler/tests/test_single_video_runner_comment_flow.py`：

```python
import asyncio
import json
from pathlib import Path


def test_single_video_runner_comment_cache_first(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    Path("data/douyin/jsonl").mkdir(parents=True, exist_ok=True)
    Path("data/douyin/jsonl/detail_comments_2099-01-01.jsonl").write_text(
        json.dumps({"aweme_id": "a", "comment_id": "c1", "content": "root", "like_count": 1, "parent_comment_id": "0", "nickname": "u"}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    from services.search_reader import VideoCandidate
    from services.run_context import RunContext
    from services.single_video_runner import SingleVideoRunner

    class _FakeDownload:
        async def download(self, *args, **kwargs):
            p = Path("v.mp4")
            p.write_text("x", encoding="utf-8")
            return p

    class _FakeASR:
        async def transcribe(self, *args, **kwargs):
            return "t"

    r = SingleVideoRunner()
    r.download_service = _FakeDownload()
    r.asr_service = _FakeASR()

    ctx = RunContext(run_root=Path("."), run_id="r")
    c = VideoCandidate(aweme_id="a", aweme_url="u", video_download_url="u", liked_count=1, source_keyword="k")
    out = asyncio.run(
        r.run_one(
            index=1,
            candidate=c,
            run_context=ctx,
            enable_llm=False,
            llm_model="",
            llm_base_url="",
            llm_api_key="",
            output_format="all",
            top_comments=1,
            top_replies=0,
            force_regrab=False,
        )
    )

    mvp = json.loads(ctx.output_path(kind="mvp_output", index=1, aweme_id="a").read_text(encoding="utf-8"))
    assert "comments" in mvp
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_single_video_runner_comment_flow.py -v
```

- [ ] **Step 3: 最小实现**

在 `SingleVideoRunner.run_one`：
- 新增参数 `top_comments/top_replies/force_regrab`
- cache 读取：扫描 `data/douyin/jsonl/*_comments_*.jsonl`，过滤 `aweme_id==...`
- 调用 `CommentProcessor.build(...)` 得到结构化 comments
- 写入 `mvp_output.comments = comments`
- 当在线抓取：使用 `DouYinClient.get_aweme_all_comments(...)` best-effort，并尽力落盘（失败仅 warning）
- processed_ids 更新（成功抓取/使用缓存时 comment_grabbed=true）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_single_video_runner_comment_flow.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/single_video_runner.py MediaCrawler/services/processed_registry.py MediaCrawler/tests/test_single_video_runner_comment_flow.py
git commit -m "feat(comments): fetch and attach structured comments in single video runner"
```

---

### Task 6: report_renderer 增强（💬/🗣️ 新章节）

**Files:**
- Modify: `MediaCrawler/services/report_renderer.py`
- Test: `MediaCrawler/tests/test_report_renderer_comments.py`

- [ ] **Step 1: 写失败测试**

Create `MediaCrawler/tests/test_report_renderer_comments.py`：

```python
from services.report_renderer import render_report


def test_report_contains_comment_sections():
    md = render_report(
        video_url="u",
        transcript="t",
        valuable_comments=[{"comment_text": "c", "tags": ["#x"], "reason": "r"}],
        knowledge_points=[],
        suggestions=[],
        community_insights={"consensus": ["a"], "controversy": ["b"]},
    )
    assert "## 💬 高赞评论精选" in md
    assert "## 🗣️ 社区共识与争议" in md
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_report_renderer_comments.py -v
```

- [ ] **Step 3: 最小实现**

扩展 `render_report(...)` 新增参数 `community_insights`（默认空），并插入两个章节：
- 💬：展示 valuable_comments（为空则（无））
- 🗣️：展示 consensus/controversy（为空则（无））

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_report_renderer_comments.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/report_renderer.py MediaCrawler/tests/test_report_renderer_comments.py
git commit -m "feat(report): add comment highlight and community insight sections"
```

---

### Task 7: KnowledgeBase 增强（kb_index.comments_summary + kb_summary 社区聚合）

**Files:**
- Modify: `MediaCrawler/services/knowledge_base.py`
- Test: `MediaCrawler/tests/test_knowledge_base_comments.py`

- [ ] **Step 1: 写失败测试（kb_index 包含 comments_summary）**

Create `MediaCrawler/tests/test_knowledge_base_comments.py`：

```python
import json
from pathlib import Path


def test_kb_index_has_comments_summary(tmp_path):
    run_dir = tmp_path / "runs/r"
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "mvp_analysis_001_1.json").write_text(
        json.dumps(
            {
                "status": "success",
                "video_url": "u1",
                "knowledge_points": [],
                "comment_value_judge": {"items": [{"tags": ["#a"]}]},
                "community_insights": {"consensus": ["c1"], "controversy": ["v1"]},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    from services.knowledge_base import KnowledgeBase

    kb = KnowledgeBase(run_dir=run_dir, run_id="r")
    kb.build(use_llm=False)
    first = (run_dir / "kb_index_r.jsonl").read_text(encoding="utf-8").splitlines()[0]
    obj = json.loads(first)
    assert "comments_summary" in obj
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_knowledge_base_comments.py -v
```

- [ ] **Step 3: 最小实现**

在 `KnowledgeBase.build` 写 kb_index 行时加入：
- `comments_summary = {consensus: [...], controversy: [...], tags: [...]}`（条数可裁剪为前 3）

并在 `kb_summary` 规则降级模板中增加一段 “社区反馈（跨视频）” 汇总（简单去重即可）。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_knowledge_base_comments.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/knowledge_base.py MediaCrawler/tests/test_knowledge_base_comments.py
git commit -m "feat(kb): aggregate community insights into index and summary"
```

---

### Task 8: 全量测试 + 推送

**Files:**
- (无新增文件)

- [ ] **Step 1: 运行 Phase 2/2.5 测试集**

```bash
cd MediaCrawler
pytest -q \
  tests/test_phase25_comments_cli_args.py \
  tests/test_comment_processor.py \
  tests/test_llm_analyzer_with_comments.py \
  tests/test_analysis_pipeline_comments.py \
  tests/test_single_video_runner_comment_flow.py \
  tests/test_report_renderer_comments.py \
  tests/test_knowledge_base_comments.py \
  tests/test_mvp_pipeline.py tests/test_analysis_pipeline.py tests/test_report_renderer.py tests/test_knowledge_base.py
```

- [ ] **Step 2: 推送分支**

```bash
cd /workspace
git push origin trae/solo-agent-M3pw1t
```

