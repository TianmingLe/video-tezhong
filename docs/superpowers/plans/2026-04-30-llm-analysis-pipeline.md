# LLM 分析与报告（Phase 2 / 方案 B）Implementation Plan

> **For agentic workers:** 推荐使用 executing-plans 逐任务执行。所有步骤遵循 TDD（先写失败测试，再写最小实现）。

**Goal:** 在现有 dy/detail MVP（下载+ASR）基础上，新增可选的 LLM 智能分析与 Markdown 报告输出（results/mvp_analysis.json + results/mvp_report.md），并支持用户自定义 `--llm-model/--llm-base-url`、30 分钟缓存、token/cost 统计与失败降级。

**Architecture:** 保持 `MVPPipeline` 只负责“抓取/下载/ASR/产出 mvp_output.json”，新增 `AnalysisPipeline` 负责“读取 mvp_output.json（+可选评论jsonl）→ LLM 分析 → 生成 analysis.json + report.md”。`main.py` 在 `--enable-llm` 时顺序执行两段 pipeline。

**Tech Stack:** Python, Typer CLI, LiteLLM（OpenAI 兼容协议）, PyYAML（读取 prompts/config）, pytest, 现有 cache（memory/redis 可选）

---

## 文件结构（将创建/修改的文件）

**Create**
- `MediaCrawler/config/llm_config.yaml`
- `MediaCrawler/config/prompts.yaml`
- `MediaCrawler/services/llm_client.py`
- `MediaCrawler/services/llm_cache.py`
- `MediaCrawler/services/llm_prompts.py`
- `MediaCrawler/services/llm_analyzer.py`
- `MediaCrawler/services/report_renderer.py`
- `MediaCrawler/pipelines/analysis_pipeline.py`
- `MediaCrawler/tests/test_analysis_pipeline.py`
- `MediaCrawler/tests/test_llm_client.py`
- `MediaCrawler/tests/test_llm_cache.py`
- `MediaCrawler/tests/test_llm_analyzer.py`
- `MediaCrawler/tests/test_report_renderer.py`

**Modify**
- `MediaCrawler/requirements.txt`
- `MediaCrawler/config/base_config.py`
- `MediaCrawler/cmd_arg/arg.py`
- `MediaCrawler/main.py`
- `MediaCrawler/pipelines/mvp_pipeline.py`（仅用于：当 enable-llm 时允许抓取评论，避免 analysis 缺输入）

---

### Task 1: 依赖与配置文件骨架

**Files:**
- Modify: `MediaCrawler/requirements.txt`
- Create: `MediaCrawler/config/llm_config.yaml`
- Create: `MediaCrawler/config/prompts.yaml`

- [ ] **Step 1: 写一个失败测试（仅验证配置文件存在）**

Create `MediaCrawler/tests/test_llm_prompts.py`：

```python
from pathlib import Path


def test_llm_config_files_exist():
    assert Path("config/llm_config.yaml").exists()
    assert Path("config/prompts.yaml").exists()
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd MediaCrawler
pytest tests/test_llm_prompts.py -v
```

Expected: FAIL（文件不存在）

- [ ] **Step 3: 添加最小依赖与配置文件**

Update `MediaCrawler/requirements.txt` 增加（版本可先不锁死）：

```text
litellm>=1.0.0
PyYAML>=6.0.0
```

Create `MediaCrawler/config/llm_config.yaml`：

```yaml
default_model: ""
default_base_url: ""
timeout_s: 60
temperature: 0.2
max_tokens: 1200
cache_ttl_seconds: 1800
cache_type: memory
prompt_file: config/prompts.yaml
```

Create `MediaCrawler/config/prompts.yaml`（先给最小可运行模板，后续可优化）：

```yaml
comment_value_judge:
  system: "你是一个资深内容运营分析助手。请严格输出 JSON，不要输出多余文字。"
  user: |
    视频主题：{video_topic}
    评论列表（JSON）：{comments_json}
    任务：判断每条评论是否有价值，并输出数组，每项包含 comment_text,is_valuable,tags,reason。

knowledge_extract:
  system: "你是一个知识提炼助手。请严格输出 JSON，不要输出多余文字。"
  user: |
    转写文本（含时间戳）：{transcript}
    OCR文本（可为空）：{ocr_text}
    任务：提取知识点列表，输出数组，每项包含 title,content,timestamp（从转写时间戳中提取）。

report_generate:
  system: "你是一个报告撰写助手。请输出 Markdown。"
  user: |
    视频信息（JSON）：{video_info_json}
    高价值评论（JSON）：{valuable_comments_json}
    知识点（JSON）：{knowledge_points_json}
    任务：生成结构化 Markdown 报告，包含：视频信息、TL;DR、知识点、评论、可执行建议。
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_llm_prompts.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/requirements.txt MediaCrawler/config/llm_config.yaml MediaCrawler/config/prompts.yaml MediaCrawler/tests/test_llm_prompts.py
git commit -m "feat(llm): add llm config and prompt templates"
```

---

### Task 2: LLM 配置与 Prompt 加载器（YAML）

**Files:**
- Create: `MediaCrawler/services/llm_prompts.py`
- Test: `MediaCrawler/tests/test_llm_prompts_loader.py`

- [ ] **Step 1: 写失败测试**

`MediaCrawler/tests/test_llm_prompts_loader.py`：

```python
from services.llm_prompts import PromptStore


def test_prompt_store_loads_templates():
    store = PromptStore.from_files("config/llm_config.yaml")
    tpl = store.get("knowledge_extract")
    assert "{transcript}" in tpl.user
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_llm_prompts_loader.py -v
```

- [ ] **Step 3: 最小实现**

`MediaCrawler/services/llm_prompts.py`：

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

import yaml


@dataclass(frozen=True)
class PromptTemplate:
    system: str
    user: str


class PromptStore:
    def __init__(self, templates: Dict[str, PromptTemplate]):
        self._templates = templates

    @staticmethod
    def from_files(llm_config_path: str) -> "PromptStore":
        cfg = yaml.safe_load(Path(llm_config_path).read_text(encoding="utf-8"))
        prompt_file = cfg.get("prompt_file")
        data: Dict[str, Any] = yaml.safe_load(Path(prompt_file).read_text(encoding="utf-8"))
        templates = {
            k: PromptTemplate(system=v.get("system", ""), user=v.get("user", ""))
            for k, v in data.items()
        }
        return PromptStore(templates)

    def get(self, name: str) -> PromptTemplate:
        return self._templates[name]
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_llm_prompts_loader.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/llm_prompts.py MediaCrawler/tests/test_llm_prompts_loader.py
git commit -m "feat(llm): add yaml prompt loader"
```

---

### Task 3: LLM Client（LiteLLM OpenAI 兼容调用 + token/cost 统计）

**Files:**
- Create: `MediaCrawler/services/llm_client.py`
- Test: `MediaCrawler/tests/test_llm_client.py`

- [ ] **Step 1: 写失败测试（用 monkeypatch 模拟 litellm）**

`MediaCrawler/tests/test_llm_client.py`：

```python
import asyncio
import sys
from types import SimpleNamespace


class _FakeResp:
    def __init__(self):
        self.choices = [SimpleNamespace(message={"content": "ok"})]
        self.usage = {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
        self._hidden_params = {"response_cost": 0.001}


def test_llm_client_returns_text_and_usage(monkeypatch):
    fake_litellm = SimpleNamespace(
        completion=lambda **kwargs: _FakeResp(),
    )
    monkeypatch.setitem(sys.modules, "litellm", fake_litellm)

    from services.llm_client import LLMClient

    client = LLMClient()
    res = asyncio.run(
        client.chat(
            model="any",
            api_base="http://x/v1",
            api_key="k",
            messages=[{"role": "user", "content": "hi"}],
            temperature=0.2,
            max_tokens=100,
            timeout_s=5,
        )
    )
    assert res.text == "ok"
    assert res.usage["total_tokens"] == 15
    assert res.cost_usd == 0.001
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_llm_client.py -v
```

- [ ] **Step 3: 最小实现**

`MediaCrawler/services/llm_client.py`：

```python
import asyncio
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class LLMResult:
    text: str
    usage: Dict[str, int]
    cost_usd: Optional[float]


class LLMClient:
    async def chat(
        self,
        *,
        model: str,
        api_base: str,
        api_key: str,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
        timeout_s: int,
    ) -> LLMResult:
        def _blocking_call() -> Any:
            import litellm  # type: ignore

            return litellm.completion(
                model=model,
                messages=messages,
                api_base=api_base,
                api_key=api_key,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=timeout_s,
            )

        resp = await asyncio.to_thread(_blocking_call)
        text = resp.choices[0].message["content"]
        usage = getattr(resp, "usage", None) or {}
        hidden = getattr(resp, "_hidden_params", None) or {}
        cost = hidden.get("response_cost")
        return LLMResult(text=text, usage=usage, cost_usd=cost)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_llm_client.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/llm_client.py MediaCrawler/tests/test_llm_client.py
git commit -m "feat(llm): add litellm client wrapper"
```

---

### Task 4: 30 分钟缓存（LLMCache）

**Files:**
- Create: `MediaCrawler/services/llm_cache.py`
- Test: `MediaCrawler/tests/test_llm_cache.py`

- [ ] **Step 1: 写失败测试**

`MediaCrawler/tests/test_llm_cache.py`：

```python
import time

from services.llm_cache import LLMCache


def test_llm_cache_ttl(monkeypatch):
    t = [1000.0]
    monkeypatch.setattr(time, "time", lambda: t[0])

    cache = LLMCache(ttl_seconds=10)
    cache.set("k", {"x": 1})
    assert cache.get("k") == {"x": 1}

    t[0] = 1011.0
    assert cache.get("k") is None
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_llm_cache.py -v
```

- [ ] **Step 3: 最小实现（先实现 memory 版，redis 留扩展）**

`MediaCrawler/services/llm_cache.py`：

```python
import time
from typing import Any, Dict, Optional, Tuple


class LLMCache:
    def __init__(self, *, ttl_seconds: int):
        self._ttl = ttl_seconds
        self._store: Dict[str, Tuple[Any, float]] = {}

    def get(self, key: str) -> Optional[Any]:
        v = self._store.get(key)
        if not v:
            return None
        value, exp = v
        if exp < time.time():
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (value, time.time() + self._ttl)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_llm_cache.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/llm_cache.py MediaCrawler/tests/test_llm_cache.py
git commit -m "feat(llm): add ttl cache for llm results"
```

---

### Task 5: Analyzer（评论判定 + 知识点提取）与 JSON 解析降级

**Files:**
- Create: `MediaCrawler/services/llm_analyzer.py`
- Test: `MediaCrawler/tests/test_llm_analyzer.py`

- [ ] **Step 1: 写失败测试（用 fake LLMClient 返回 JSON）**

`MediaCrawler/tests/test_llm_analyzer.py`：

```python
import asyncio

from services.llm_client import LLMResult


class _FakeClient:
    async def chat(self, **kwargs):
        if kwargs.get("prompt_name") == "comment_value_judge":
            return LLMResult(
                text='[{"comment_text":"a","is_valuable":true,"tags":["#t"],"reason":"r"}]',
                usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
                cost_usd=0.0,
            )
        return LLMResult(
            text='[{"title":"k","content":"c","timestamp":"00:00:01.000"}]',
            usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            cost_usd=0.0,
        )


def test_analyzer_parses_outputs(tmp_path):
    from services.llm_prompts import PromptTemplate, PromptStore
    from services.llm_analyzer import LLMAnalyzer

    store = PromptStore(
        {
            "comment_value_judge": PromptTemplate(system="", user="{video_topic}{comments_json}"),
            "knowledge_extract": PromptTemplate(system="", user="{transcript}{ocr_text}"),
        }
    )
    analyzer = LLMAnalyzer(prompt_store=store, cache=None, llm_client=_FakeClient())

    out = asyncio.run(
        analyzer.analyze(
            model="m",
            api_base="b",
            api_key="k",
            video_topic="t",
            transcript="x",
            comments=[{"text": "a", "like_count": 1}],
            ocr_text="",
        )
    )
    assert out["comment_value_judge"]["items"][0]["is_valuable"] is True
    assert out["knowledge_points"][0]["title"] == "k"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_llm_analyzer.py -v
```

- [ ] **Step 3: 最小实现（包含 JSON 解析失败降级为空）**

实现要点：
- Analyzer 负责把 prompt 渲染为 messages（system/user）
- 结果必须是可 JSON parse；失败则返回空数组并附带 `parse_error`
- 同时汇总 token/cost（两次调用相加）

（实现代码略，执行时完整写入 `services/llm_analyzer.py`）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_llm_analyzer.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/llm_analyzer.py MediaCrawler/tests/test_llm_analyzer.py
git commit -m "feat(llm): add analyzer for comments and knowledge points"
```

---

### Task 6: Markdown 报告渲染器（ReportRenderer）

**Files:**
- Create: `MediaCrawler/services/report_renderer.py`
- Test: `MediaCrawler/tests/test_report_renderer.py`

- [ ] **Step 1: 写失败测试**

`MediaCrawler/tests/test_report_renderer.py`：

```python
from services.report_renderer import render_report


def test_report_contains_sections():
    md = render_report(
        video_url="u",
        transcript="t",
        valuable_comments=[{"comment_text": "c", "tags": ["#x"], "reason": "r"}],
        knowledge_points=[{"title": "k", "content": "cc", "timestamp": "00:00:01.000"}],
        suggestions=["s1"],
    )
    assert "## 视频信息" in md
    assert "## 知识点" in md
    assert "## 高价值评论" in md
    assert "## 可执行建议" in md
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_report_renderer.py -v
```

- [ ] **Step 3: 最小实现**

`MediaCrawler/services/report_renderer.py`：

```python
from typing import Any, Dict, List


def render_report(
    *,
    video_url: str,
    transcript: str,
    valuable_comments: List[Dict[str, Any]],
    knowledge_points: List[Dict[str, Any]],
    suggestions: List[str],
) -> str:
    lines: List[str] = []
    lines.append("# MVP 分析报告")
    lines.append("")
    lines.append("## 视频信息")
    lines.append(f"- video_url: {video_url}")
    lines.append("")
    lines.append("## 知识点")
    for kp in knowledge_points:
        lines.append(f"- {kp.get('timestamp','')}: {kp.get('title','')}")
        lines.append(f"  - {kp.get('content','')}")
    lines.append("")
    lines.append("## 高价值评论")
    for c in valuable_comments:
        tags = " ".join(c.get("tags") or [])
        lines.append(f"- {tags} {c.get('comment_text','')}")
        lines.append(f"  - {c.get('reason','')}")
    lines.append("")
    lines.append("## 可执行建议")
    for s in suggestions:
        lines.append(f"- {s}")
    lines.append("")
    return "\n".join(lines)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_report_renderer.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/services/report_renderer.py MediaCrawler/tests/test_report_renderer.py
git commit -m "feat(report): add markdown report renderer"
```

---

### Task 7: AnalysisPipeline（读取 mvp_output.json → LLM 分析 → 写 analysis/report）

**Files:**
- Create: `MediaCrawler/pipelines/analysis_pipeline.py`
- Test: `MediaCrawler/tests/test_analysis_pipeline.py`

- [ ] **Step 1: 写失败测试（不依赖真实 LLM）**

`MediaCrawler/tests/test_analysis_pipeline.py`：

```python
import asyncio
import json
from pathlib import Path


class _FakeAnalyzer:
    async def analyze(self, **kwargs):
        return {
            "status": "success",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2, "cost_usd": 0.0},
            "comment_value_judge": {"missing_comments": True, "items": []},
            "knowledge_points": [],
            "suggestions": ["s"],
        }


def test_analysis_pipeline_writes_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    Path("results").mkdir(parents=True, exist_ok=True)
    Path("results/mvp_output.json").write_text(
        json.dumps({"video_url": "u", "transcript": "t", "source_contents_file": "x"}, ensure_ascii=False),
        encoding="utf-8",
    )

    from pipelines.analysis_pipeline import AnalysisPipeline

    p = AnalysisPipeline(analyzer=_FakeAnalyzer())
    out = asyncio.run(p.run(model="m", api_base="b", api_key="k"))
    assert out["status"] == "success"
    assert Path("results/mvp_analysis.json").exists()
    assert Path("results/mvp_report.md").exists()
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_analysis_pipeline.py -v
```

- [ ] **Step 3: 最小实现**

实现要点：
- 读取 `results/mvp_output.json`
- 调用 analyzer（传入 video_url/transcript/comments/ocr_text）
- 写出 `results/mvp_analysis.json` 与 `results/mvp_report.md`
- 失败降级：写 `status=error` + error_code/error_message

（实现代码略，执行时完整写入 `pipelines/analysis_pipeline.py`）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_analysis_pipeline.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/pipelines/analysis_pipeline.py MediaCrawler/tests/test_analysis_pipeline.py
git commit -m "feat(pipeline): add analysis pipeline for llm outputs"
```

---

### Task 8: CLI 接入（--enable-llm + --llm-*）与 main 串联执行

**Files:**
- Modify: `MediaCrawler/config/base_config.py`
- Modify: `MediaCrawler/cmd_arg/arg.py`
- Modify: `MediaCrawler/main.py`
- Modify: `MediaCrawler/pipelines/mvp_pipeline.py`
- Test: `MediaCrawler/tests/test_cli_llm_flags.py`

- [ ] **Step 1: 写失败测试（只验证 parse_cmd 能返回字段）**

`MediaCrawler/tests/test_cli_llm_flags.py`：

```python
import asyncio
import sys


def test_parse_cmd_has_llm_fields(monkeypatch):
    from cmd_arg import arg

    monkeypatch.setattr(sys, "argv", ["main.py", "--platform", "dy", "--pipeline", "mvp", "--specified_id", "x", "--enable-llm", "true", "--llm-model", "m", "--llm-base-url", "http://x/v1"])
    ns = asyncio.run(arg.parse_cmd())
    assert hasattr(ns, "enable_llm")
    assert hasattr(ns, "llm_model")
    assert hasattr(ns, "llm_base_url")
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd MediaCrawler
pytest tests/test_cli_llm_flags.py -v
```

- [ ] **Step 3: 最小实现**

实现要点：
- 在 `config/base_config.py` 增加默认值：
  - `ENABLE_LLM = False`
  - `LLM_MODEL = ""`
  - `LLM_BASE_URL = ""`
  - `LLM_API_KEY = ""`（可选，仅作为运行时容器，默认空）
- 在 `cmd_arg/arg.py`：
  - 新增 options：`--enable-llm/--llm-model/--llm-base-url/--llm-api-key`
  - 按现有风格：enable_llm 用 `str` + `_to_bool()`
  - callback 内 override `config.ENABLE_LLM/config.LLM_MODEL/...`
  - 返回的 SimpleNamespace 增加这些字段
- 在 `main.py` 的 mvp 分支中：
  - 先运行 `MVPPipeline(...)`
  - 若 `args.enable_llm` 为 true，则运行 `AnalysisPipeline(...)`
- 在 `mvp_pipeline.py`：
  - 将 `_run_crawler()` 内 `config.ENABLE_GET_COMMENTS` 的强制 false 改为“尊重 config 当前值”
  - 并在 main 的 mvp 分支里：当 enable_llm 时把 `config.ENABLE_GET_COMMENTS = True`（让 analysis 有评论可用）

- [ ] **Step 4: 运行测试确认通过**

```bash
cd MediaCrawler
pytest tests/test_cli_llm_flags.py -v
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add MediaCrawler/config/base_config.py MediaCrawler/cmd_arg/arg.py MediaCrawler/main.py MediaCrawler/pipelines/mvp_pipeline.py MediaCrawler/tests/test_cli_llm_flags.py
git commit -m "feat(cli): add llm flags and run analysis pipeline"
```

---

### Task 9: 端到端本地验证（不依赖真实 LLM 的 smoke）

**Files:**
- (无需新增文件，作为手工验证步骤)

- [ ] **Step 1: 运行所有新增单测**

```bash
cd MediaCrawler
pytest -q tests/test_llm_prompts.py tests/test_llm_prompts_loader.py tests/test_llm_client.py tests/test_llm_cache.py tests/test_llm_analyzer.py tests/test_report_renderer.py tests/test_analysis_pipeline.py tests/test_cli_llm_flags.py
```

Expected: 全部 PASS

- [ ] **Step 2: 本地执行命令（需要你提供真实 base_url + key + 可访问的 specified_id）**

```bash
python main.py --platform dy --pipeline mvp --specified_id <视频ID或URL> --enable-llm true --llm-model "<模型名>" --llm-base-url "<http://.../v1>"
```

Expected:
- `results/mvp_output.json` 存在
- `results/mvp_analysis.json` 存在（成功或 error 但结构完整）
- `results/mvp_report.md` 存在（成功或降级报告）

---

## Self-Review（计划自检）

- Spec 覆盖检查：
  - enable-llm + 额外 outputs：Task 7/8 覆盖
  - 用户自定义 model/base_url：Task 8 覆盖
  - Token/Cost：Task 3（usage + response_cost）
  - 30 分钟缓存：Task 4（TTL）
  - 错误降级：Task 7（error_code/error_message）
  - Prompt 可配置：Task 1/2（prompts.yaml）
- Placeholder 扫描：本计划中标注“实现代码略”的文件，在执行阶段必须写出完整实现并保持测试驱动。

