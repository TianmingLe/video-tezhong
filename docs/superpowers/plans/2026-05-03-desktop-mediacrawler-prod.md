# Desktop MediaCrawler 生产级一键管道（V1+）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Desktop 内置 MediaCrawler（抖音/小红书/B站）一键采集管道，并补齐生产级任务模板库、参数校验、失败自动重试、基础资源管控，以及报告页的 Markdown 预览 + 时间轴摘要（并把 MediaCrawler 自带的 LLM 分析能力接入为可选项）。

**Architecture:** Renderer 选择模板并生成受控 `payload` → Preload/IPC 透传 `job.start`（支持 payload）→ Main 侧二次校验并确保 venv → 用 venv python 跑受控 runner（runner 再调用 MediaCrawler `main.py` pipeline）→ 产物写到 `<userData>/results/runs/<runId>/` → Reports 页读取并展示日志/Markdown/摘要与时间轴。

**Tech Stack:** Electron (main/preload/renderer) + TypeScript + React + zod + SQLite (better-sqlite3) + Python venv + MediaCrawler

---

## 0. File Map

**Create**
- `desktop/resources/python/run_mediacrawler.py`
- `desktop/electron/renderer/src/features/task/mediacrawlerSchema.ts`
- `desktop/electron/renderer/src/features/task/templates/mediacrawlerTemplates.ts`
- `desktop/electron/renderer/src/features/report/RunArtifactsPanel.tsx`
- `desktop/electron/renderer/src/features/report/RunTimeline.tsx`

**Modify**
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/main/job/JobQueue.ts`
- `desktop/electron/main/job/jobRuntime.ts`
- `desktop/electron/main/process/PythonProcessManager.ts`
- `desktop/electron/main/db/tasksRepo.ts`
- `desktop/electron/main/db/configsRepo.ts`
- `desktop/electron/renderer/src/features/task/configSchema.ts`
- `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`
- `desktop/electron/renderer/src/features/task/TaskController.tsx`
- `desktop/electron/renderer/src/pages/ReportPage.tsx`
- `desktop/electron-builder.yml`

**Existing (already present)**
- `MediaCrawler/main.py`
- `MediaCrawler/requirements.txt`

---

## 1) Task: IPC 合约升级（job.start 支持 payload + 资源/重试参数）

**Files:**
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`
- Test: `desktop/electron/shared/ipc.test.ts`

- [ ] **Step 1: 扩展 preload 类型**

在 `desktop/electron/preload/types.ts`：

```ts
export type JobStartRequest = {
  runId: string
  script: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  pythonBin?: string
  payload?: unknown
  maxAttempts?: number
  timeoutMs?: number
}
```

并保持 `DesktopApi.job.start` 仍返回 `JobStartResult`。

- [ ] **Step 2: preload 透传 payload**

在 `desktop/electron/preload/index.ts` 中保持：

```ts
start: async (config) => await ipcRenderer.invoke(ipcChannels.jobStart, config)
```

（只要类型允许，运行期无需改动逻辑）

- [ ] **Step 3: 更新 ipc.test**

运行：`cd /workspace/desktop && npm test electron/shared/ipc.test.ts`
期望：PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/shared/ipc.ts desktop/electron/preload/types.ts desktop/electron/preload/index.ts desktop/electron/shared/ipc.test.ts
git commit -m "feat(ipc): extend job.start for payload, retry and limits"
```

---

## 2) Task: JobQueue / PythonProcessManager 支持 pythonBin / cwd / timeoutMs

**Files:**
- Modify: `desktop/electron/main/job/JobQueue.ts`
- Modify: `desktop/electron/main/process/PythonProcessManager.ts`
- Test: `desktop/electron/main/job/jobRuntime.test.ts`（若存在）或新增对应单测

- [ ] **Step 1: 扩展 JobRequest**

在 `desktop/electron/main/job/JobQueue.ts`：

```ts
export type JobRequest = {
  runId: string
  script: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  pythonBin?: string
  timeoutMs?: number
}
```

- [ ] **Step 2: PythonProcessManager.start 支持 pythonBin/cwd**

在 `desktop/electron/main/process/PythonProcessManager.ts`：

1) `JobConfig` 增加 `pythonBin?: string`（与 `JobQueue.JobRequest` 对齐）
2) spawn 时改为：

```ts
const bin = cfg.pythonBin ?? this.pythonBin
const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd, env })
```

- [ ] **Step 3: 增加 timeoutMs（软限制）**

在 `JobQueue.startRun()` 里启动成功后，若 `req.timeoutMs` 为正数：
- `setTimeout(() => deps.killTree(pid), timeoutMs)`
- 并在 job 结束时清理 timer（可放到 JobRecord 上保存 timer id）

验收：超时会触发 kill，并在 DB 中体现为 `exited`（exit_code 非 0）或 `error`（由 kill 导致）。

- [ ] **Step 4: Run tests**

运行：`cd /workspace/desktop && npm test`
期望：PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/main/job/JobQueue.ts desktop/electron/main/process/PythonProcessManager.ts
git commit -m "feat(job): support pythonBin/cwd/timeout"
```

---

## 3) Task: Main 侧接入 MediaCrawler 管道（payload 校验 → venv → runner）

**Files:**
- Modify: `desktop/electron/main/index.ts`
- Use existing: `desktop/electron/main/python/PythonEnvManager.ts`
- Use existing: `desktop/electron/main/mediacrawler/mediacrawlerTaskSpec.ts`
- Use existing: `desktop/electron/main/mediacrawler/mediacrawlerRunner.ts`
- Create: `desktop/resources/python/run_mediacrawler.py`
- Test: 新增/扩展 main 层单测（优先沿用 vitest）

- [ ] **Step 1: main jobStart handler 支持 payload**

把 `ipcMain.handle(ipcChannels.jobStart, ...)` 的入参类型放宽为 `unknown`，并在 main 侧做 parse：

```ts
const o = (input && typeof input === 'object' ? (input as Record<string, unknown>) : null) ?? {}
const runId = String(o.runId ?? '').trim()
const script = String(o.script ?? '').trim()
const args = Array.isArray(o.args) ? o.args.map((x) => String(x)) : []
const env = (o.env && typeof o.env === 'object' ? (o.env as Record<string, unknown>) : null) ?? {}
```

env 转为 `Record<string, string>`（仅保留 string 值）。

- [ ] **Step 2: mediacrawler 分支**

当 `script === 'mediacrawler'`：
- 读取 `payload` 并调用 `validateMediaCrawlerTaskSpec(payload)`
- `PythonEnvManager.ensureMediacrawlerEnv({ pythonIndexUrl })`
- `writeTaskJson({ userDataPath, spec })`（spec.runId 必须与 runId 一致）
- `resolveMediaCrawlerRoot()` / `resolveMediaCrawlerRunnerScript()` 得到 cwd 与 runner 路径
- 调 `jobRuntime.enqueue({ runId, script: runnerPyPath, args: [taskJsonPath], cwd: mediaCrawlerRoot, pythonBin: venvPython, env })`

同时把任务 spec 写入 tasks 表（不写入任何 API key）：
- `tasks.task_spec_json = JSON.stringify(specWithoutSecrets)`
- `tasks.max_attempts = maxAttempts ?? 1`
- `tasks.attempt = 1`

- [ ] **Step 3: runner 脚本落地**

创建 `desktop/resources/python/run_mediacrawler.py`，核心职责：
- 读取 task.json（包含 kind/runId/args/llm 设置）
- 根据 kind 构造 MediaCrawler 的 CLI 参数，并调用 `subprocess.Popen([sys.executable, "-u", "main.py", ...], cwd=<MediaCrawlerRoot>)`
- 实时转发 stdout/stderr 到自身 stdout（保持 Desktop 日志）
- 额外写 `<runDir>/events.jsonl`（每行 JSON 包含 ts/type/msg），用于时间轴摘要
- 退出码跟随 MediaCrawler 进程退出码

建议映射：
- dy_mvp：`--pipeline mvp --platform dy --type detail --specified_id <aweme_url_or_id> [--enable-llm --llm-model ... --llm-base-url ...]`
- xhs_search：`--pipeline mvp --platform xhs --type search --keywords <kw> --limit <n> [--enable-llm ...]`
- bili_search：`--pipeline mvp --platform bili --type search --keywords <kw> --limit <n> [--enable-llm ...]`

- [ ] **Step 4: Run tests**

运行：`cd /workspace/desktop && npm test`
期望：PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/main/index.ts desktop/resources/python/run_mediacrawler.py
git commit -m "feat(mediacrawler): wire job.start payload to venv runner"
```

---

## 4) Task: Renderer 内置模板库 + 参数校验 + 提交 payload

**Files:**
- Create: `desktop/electron/renderer/src/features/task/mediacrawlerSchema.ts`
- Create: `desktop/electron/renderer/src/features/task/templates/mediacrawlerTemplates.ts`
- Modify: `desktop/electron/renderer/src/features/task/configSchema.ts`
- Modify: `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`
- Modify: `desktop/electron/renderer/src/features/task/TaskController.tsx`
- Test: `desktop/electron/renderer/src/features/task/configSchema.test.ts`（扩展覆盖 mediacrawler）

- [ ] **Step 1: configSchema 扩展**

在 `configSchema.ts`：
- `scriptEnum` 增加 `'mediacrawler'`
- `taskConfigSchema` 增加 `mediacrawler` 字段（按 kind union），例如：

```ts
mediacrawler: z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('dy_mvp'), specifiedId: z.string().min(1), enableLlm: z.boolean().default(false) }),
    z.object({ kind: z.literal('xhs_search'), keywords: z.string().min(1), limit: z.number().int().min(1).max(50).default(10), enableLlm: z.boolean().default(false) }),
    z.object({ kind: z.literal('bili_search'), keywords: z.string().min(1), limit: z.number().int().min(1).max(50).default(10), enableLlm: z.boolean().default(false) })
  ])
  .optional()
```

并在 `superRefine` 中保证当 `script==='mediacrawler'` 时 `mediacrawler` 必填。

- [ ] **Step 2: TaskConfigForm 增加模板选择与字段**

当脚本选择 `mediacrawler` 时：
- 显示 `kind` 下拉（dy_mvp/xhs_search/bili_search）
- 根据 kind 展示对应输入
- 增加 `enableLlm` 勾选 + 提示（“需要在设置中配置模型/地址/密钥”）
- 增加 `maxAttempts`、`timeoutMs`（生产级基础管控）

并在“保存为模板”时把 `task_spec_json` 一并保存（见 Task 6）。

- [ ] **Step 3: TaskController 提交分支**

当 `cfg.script === 'mediacrawler'`：
- 构建 payload（不包含任何密钥）：

```ts
const payload = { kind: cfg.mediacrawler.kind, runId, args: { ... } }
```

- 以逻辑脚本名提交：

```ts
await window.api.job.start({ runId, script: 'mediacrawler', args: [], env: cfg.env, payload, maxAttempts: cfg.maxAttempts, timeoutMs: cfg.timeoutMs })
```

否则保持原逻辑（scripts/<py>）。

- [ ] **Step 4: Run tests**

运行：`cd /workspace/desktop && npm test`
期望：PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/renderer/src/features/task
git commit -m "feat(task): add mediacrawler templates, validation and payload submit"
```

---

## 5) Task: 生产级任务模板库（内置 + 用户模板：task_spec_json）

**Files:**
- Modify: `desktop/electron/main/db/configsRepo.ts`
- Modify: `desktop/electron/main/index.ts`（kbSave 接受 task_spec_json）
- Modify: `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`

- [ ] **Step 1: configsRepo.insert 写入 task_spec_json**

把 insert SQL 扩展为包含 `task_spec_json`（字段已在 schema 里，需要确保 repo 写入）：

```ts
insert into configs(name, script, scenario, gateway_ws, env, is_default, task_spec_json)
values(@name, @script, @scenario, @gateway_ws, @env, @is_default, @task_spec_json)
```

- [ ] **Step 2: kbSave 接受 task_spec_json**

在 `desktop/electron/main/index.ts` 的 `ipcChannels.kbSave` handler 读取 `task_spec_json` 并传给 repo。

- [ ] **Step 3: TaskConfigForm 保存模板时写入 task_spec_json**

当 `script==='mediacrawler'`：
- 生成 `task_spec_json`（只包含 kind + args + enableLlm + retry/timeout 等非敏感字段）
- 调 `window.api.kb.save({... , task_spec_json })`

- [ ] **Step 4: Run tests**

运行：`cd /workspace/desktop && npm test`
期望：PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/main/db/configsRepo.ts desktop/electron/main/index.ts desktop/electron/renderer/src/features/task/TaskConfigForm.tsx
git commit -m "feat(kb): persist mediacrawler task_spec_json templates"
```

---

## 6) Task: 自动重试（maxAttempts/attempt 落库 + 失败重入队）

**Files:**
- Modify: `desktop/electron/main/db/tasksRepo.ts`
- Modify: `desktop/electron/main/job/jobRuntime.ts`
- Test: 为 retry 行为补单测（优先新增 `desktop/electron/main/job/jobRuntime.retry.test.ts`）

- [ ] **Step 1: tasksRepo 支持 attempt/max_attempts/task_spec_json 写入**

在 `tasksRepo.insert` 与 `updateStatus` 支持可选字段（如果字段存在就写入）：
- insert SQL 增加 `task_spec_json, attempt, max_attempts`
- updateStatus 允许更新 `exit_code/start_time/end_time/duration/attempt/max_attempts/task_spec_json`

- [ ] **Step 2: jobRuntime 在 exited/error 时判断是否重试**

当任务 `exit_code` 非 0 或 status error：
- 读取 tasksRepo 当前记录
- 若 `max_attempts` 存在且 `attempt < max_attempts`：
  - 将 task 状态更新为 `queued`，并把 `attempt = attempt + 1`
  - 调 `queue.enqueue` 一个新的 run（复用同 runId 不允许，因此策略为“同 runId 重用队列记录”）：需要改造 JobQueue 支持 `requeue(runId, req)` 或允许 `enqueue` 覆盖同 runId 的已结束任务

推荐实现：在 `JobQueue` 增加：

```ts
requeue(req: JobRequest): EnqueueResult
```

规则：仅当现有 job 的 state 为 `exited`/`error`/`cancelled` 才允许 requeue；保留同 runId，避免报告页分裂。

- [ ] **Step 3: 单测**

新增单测用假的 `start()`：
- 第一次返回 pid 并触发 exit(code=1)
- 第二次返回 pid 并 exit(code=0)
断言：
- tasksRepo.updateStatus 被调用两次 attempt=1/2
- 最终状态为 exited 且 exit_code=0

- [ ] **Step 4: Run tests**

运行：`cd /workspace/desktop && npm test`
期望：PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/main/db/tasksRepo.ts desktop/electron/main/job/jobRuntime.ts desktop/electron/main/job/JobQueue.ts
git commit -m "feat(job): add auto-retry with attempts"
```

---

## 7) Task: Reports 页“一步到位”展示（Logs + Markdown + 时间轴摘要 + 关键产物）

**Files:**
- Modify: `desktop/electron/shared/ipc.ts`（新增 runs:listArtifacts / runs:readFile）
- Modify: `desktop/electron/main/index.ts`（实现受控读取）
- Create: `desktop/electron/renderer/src/features/report/RunArtifactsPanel.tsx`
- Create: `desktop/electron/renderer/src/features/report/RunTimeline.tsx`
- Modify: `desktop/electron/renderer/src/pages/ReportPage.tsx`

- [ ] **Step 1: IPC：受控列目录/读文件**

新增 channel：
- `runs:listArtifacts` 入参 `{ runId: string }` → 返回 `{ files: Array<{ name: string; size: number }> }`
- `runs:readFile` 入参 `{ runId: string; name: string; maxBytes?: number }` → 返回 `{ success: true; text: string } | { success: false; error: string }`

安全规则：
- runId 禁止 `..` `/` `\\`
- name 只能是单文件名（`path.basename(name) === name`）
- 只允许读取 `<userData>/results/runs/<runId>/` 下的文件
- 最大读取字节默认 512KB（避免 UI 卡死）

- [ ] **Step 2: Renderer：RunArtifactsPanel**

功能：
- 拉取 artifacts 列表
- 自动优先展示 `results/mvp_report.md`（若存在）或任意 `*.md`
- 提供文件下拉切换
- 内容展示先用 `<pre>`（纯文本预览），保证稳定与安全

- [ ] **Step 3: Renderer：RunTimeline**

读取 `events.jsonl`（若存在）：
- 按 ts 排序
- 以列表显示最近 N 条事件（type/msg）
- 计算阶段耗时（从 first ts 到 last ts）

- [ ] **Step 4: ReportPage 接入**

在报告页 tabs 增加：
- Logs（现有）
- Report（有 md 时显示）
- Timeline（有 events.jsonl 时显示）

- [ ] **Step 5: Run tests**

运行：`cd /workspace/desktop && npm test`
期望：PASS

- [ ] **Step 6: Commit**

```bash
git add desktop/electron/shared/ipc.ts desktop/electron/main/index.ts desktop/electron/renderer/src/features/report desktop/electron/renderer/src/pages/ReportPage.tsx
git commit -m "feat(report): add artifacts + markdown preview + timeline"
```

---

## 8) Task: Packaging（把 MediaCrawler 与 runner 打进安装包）

**Files:**
- Modify: `desktop/electron-builder.yml`

- [ ] **Step 1: electron-builder extraResources**

在 `electron-builder.yml` 增加：
- `MediaCrawler/**` → `process.resourcesPath/MediaCrawler`
- `resources/python/**` → `process.resourcesPath/resources/python`

并确保 main 侧 `resolveMediaCrawlerRoot()` / `resolveMediaCrawlerRunnerScript()` 在 packaged 场景走 `process.resourcesPath`。

- [ ] **Step 2: Run pack**

运行：`cd /workspace/desktop && npm run pack`
期望：成功产出 dir 包（不要求跨平台签名）

- [ ] **Step 3: Commit**

```bash
git add desktop/electron-builder.yml desktop/resources/python/run_mediacrawler.py
git commit -m "ci(pack): bundle mediacrawler and runner resources"
```

---

## 9) Gate Checks

- [ ] Run: `cd /workspace/desktop && npm test`
Expected: PASS

- [ ] Run: `cd /workspace/desktop && npm run typecheck`
Expected: PASS

