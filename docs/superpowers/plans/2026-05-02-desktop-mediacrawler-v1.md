# Desktop MediaCrawler Pipelines (V1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Desktop 内置 MediaCrawler 一键管道（dy/xhs/bili），并提供生产级 Python venv 自动安装与基础模板/参数校验，以及 Report 页 Markdown 预览。

**Architecture:** Renderer 产出 `MediaCrawlerTaskSpec`（zod 校验）→ Main 再校验并写入 `<userData>/runs/<runId>/task.json` → `PythonEnvManager` 确保 venv → 用 venv python 执行 `run_mediacrawler.py task.json` → 产物写入 `results/runs/<runId>/` → ReportPage 增加 Markdown Tab 预览。

**Tech Stack:** Electron (main/preload/renderer) + better-sqlite3 + Python venv + pip + MediaCrawler CLI

---

## 0. File Map

**Create**
- `desktop/electron/main/python/PythonEnvManager.ts`
- `desktop/electron/main/python/PythonEnvManager.test.ts`
- `desktop/electron/main/mediacrawler/mediacrawlerTaskSpec.ts`
- `desktop/electron/main/mediacrawler/mediacrawlerTaskSpec.test.ts`
- `desktop/electron/main/mediacrawler/mediacrawlerRunner.ts`
- `desktop/electron/main/mediacrawler/mediacrawlerRunner.test.ts`
- `desktop/resources/python/run_mediacrawler.py`
- `desktop/electron/renderer/src/features/task/templates/mediacrawlerTemplates.ts`
- `desktop/electron/renderer/src/features/task/mediacrawlerSchema.ts`
- `desktop/electron/renderer/src/features/task/mediacrawlerSchema.test.ts`
- `desktop/electron/renderer/src/features/report/MarkdownPreview.tsx`
- `desktop/electron/renderer/src/features/report/MarkdownPreview.test.tsx`

**Modify**
- `desktop/electron/main/db/schema.sql`
- `desktop/electron/main/db/index.ts`
- `desktop/electron/main/db/tasksRepo.ts`
- `desktop/electron/main/db/configsRepo.ts`
- `desktop/electron/main/db/types.ts`
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/renderer/src/features/task/configSchema.ts`
- `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`
- `desktop/electron/renderer/src/features/task/TaskController.tsx`
- `desktop/electron/renderer/src/pages/ReportPage.tsx`
- `desktop/electron-builder.yml`

---

### Task 1: DB schema evolve (task_spec_json, attempts) with safe migration

**Files:**
- Modify: `desktop/electron/main/db/schema.sql`
- Modify: `desktop/electron/main/db/index.ts`
- Modify: `desktop/electron/main/db/types.ts`
- Modify: `desktop/electron/main/db/tasksRepo.ts`
- Modify: `desktop/electron/main/db/configsRepo.ts`
- Test: `desktop/electron/main/db/index.test.ts`

- [ ] **Step 1: Add new columns in schema.sql**

Edit `desktop/electron/main/db/schema.sql` to include new columns (new installs):

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  run_id TEXT UNIQUE NOT NULL,
  script TEXT NOT NULL,
  scenario TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  start_time INTEGER,
  end_time INTEGER,
  duration INTEGER,
  task_spec_json TEXT,
  attempt INTEGER,
  max_attempts INTEGER
);

CREATE TABLE IF NOT EXISTS configs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  script TEXT NOT NULL,
  scenario TEXT NOT NULL,
  gateway_ws TEXT,
  env TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  task_spec_json TEXT
);
```

- [ ] **Step 2: Add migration in initDb**

Edit `desktop/electron/main/db/index.ts` to add `ensureColumn()`:

```ts
function ensureColumn(db: SqliteDb, table: string, col: string, sqlType: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (rows.some((r) => r.name === col)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${sqlType}`)
}
```

Call after `db.exec(getSchemaSql())`:

```ts
ensureColumn(db, 'tasks', 'task_spec_json', 'TEXT')
ensureColumn(db, 'tasks', 'attempt', 'INTEGER')
ensureColumn(db, 'tasks', 'max_attempts', 'INTEGER')
ensureColumn(db, 'configs', 'task_spec_json', 'TEXT')
```

- [ ] **Step 3: Update DB types + repos**

Update `desktop/electron/main/db/types.ts`:

```ts
export type TaskRecord = {
  // ...
  task_spec_json: string | null
  attempt: number | null
  max_attempts: number | null
}

export type ConfigRecord = {
  // ...
  task_spec_json: string | null
}
```

Update `tasksRepo.insert/updateStatus` to write `task_spec_json/attempt/max_attempts` when provided. Update `configsRepo.insert` to accept optional `task_spec_json`.

- [ ] **Step 4: Add/extend tests**

Update `desktop/electron/main/db/index.test.ts` to assert columns exist via `PRAGMA table_info(tasks)` and `PRAGMA table_info(configs)`.

- [ ] **Step 5: Run tests**

Run: `cd /workspace/desktop && npm test electron/main/db/index.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add desktop/electron/main/db/schema.sql desktop/electron/main/db/index.ts desktop/electron/main/db/types.ts desktop/electron/main/db/tasksRepo.ts desktop/electron/main/db/configsRepo.ts desktop/electron/main/db/index.test.ts
git commit -m "feat(db): add task_spec_json and attempts columns"
```

---

### Task 2: Main-side MediaCrawler task spec + secure runner wiring

**Files:**
- Create: `desktop/electron/main/mediacrawler/mediacrawlerTaskSpec.ts`
- Create: `desktop/electron/main/mediacrawler/mediacrawlerTaskSpec.test.ts`
- Create: `desktop/electron/main/mediacrawler/mediacrawlerRunner.ts`
- Create: `desktop/electron/main/mediacrawler/mediacrawlerRunner.test.ts`
- Modify: `desktop/electron/main/index.ts`

- [ ] **Step 1: Define spec**

Create `desktop/electron/main/mediacrawler/mediacrawlerTaskSpec.ts` with:

```ts
export type MediaCrawlerPlatform = 'dy' | 'xhs' | 'bili'
export type MediaCrawlerTaskKind = 'dy_mvp' | 'xhs_search' | 'bili_search'

export type MediaCrawlerTaskSpec = {
  kind: MediaCrawlerTaskKind
  runId: string
  pythonIndexUrl?: string
  args: Record<string, string | number | boolean | string[]>
}

export function validateMediaCrawlerTaskSpec(input: unknown): { ok: true; value: MediaCrawlerTaskSpec } | { ok: false; error: string } {
  // minimal structural checks + whitelist keys per kind
}
```

- [ ] **Step 2: Write tests for validation**

Create `desktop/electron/main/mediacrawler/mediacrawlerTaskSpec.test.ts` covering:
- valid dy/xhs/bili specs
- rejecting unknown kind
- rejecting suspicious strings (e.g., args with `;` / `&&` in fields expected to be URL/keyword)

Run: `cd /workspace/desktop && npm test electron/main/mediacrawler/mediacrawlerTaskSpec.test.ts`  
Expected: PASS

- [ ] **Step 3: Implement mediacrawlerRunner**

Create `desktop/electron/main/mediacrawler/mediacrawlerRunner.ts`:
- `resolveMediaCrawlerRoot()`:
  - dev: repo root `../../../../MediaCrawler`
  - packaged: `process.resourcesPath/MediaCrawler`
- `writeTaskJson(runId, spec)` to `<userData>/runs/<runId>/task.json`
- `buildJobRequestForRunner(taskJsonPath, pythonBin)` returns `{ script: <runnerPyPath>, args: [taskJsonPath] , cwd: <mediacrawlerRoot> }`

- [ ] **Step 4: Wire into main job start**

Update `desktop/electron/main/index.ts` job start handler:
- if request script is `mediacrawler` (new logical script id), then:
  - validate spec from payload
  - ensure venv
  - start runner with venv python
- else follow existing legacy path

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/main/mediacrawler
git commit -m "feat(mediacrawler): add main-side spec and runner wiring"
```

---

### Task 3: PythonEnvManager (venv + pip install) with progress logs

**Files:**
- Create: `desktop/electron/main/python/PythonEnvManager.ts`
- Create: `desktop/electron/main/python/PythonEnvManager.test.ts`
- Modify: `desktop/electron/main/system/checkPython.ts`

- [ ] **Step 1: Add python version gate**

Update `checkPython.ts` to return version, and add a helper:

```ts
export function isPythonVersionSupported(version: string): boolean
```

Gate: `>= 3.11`

- [ ] **Step 2: Implement venv ensure**

Create `PythonEnvManager.ts`:

```ts
export type EnvEnsureResult = { ok: true; pythonBin: string } | { ok: false; error: string; suggestion: string }

export class PythonEnvManager {
  constructor(args: {
    userDataPath: string
    systemPythonBin: string
    log: (line: string) => void
  })
  ensureMediacrawlerEnv(): Promise<EnvEnsureResult>
}
```

Behavior:
- venvPath = `<userData>/python/mediacrawler-venv`
- marker = `<venvPath>/.omni-installed.json` stores:
  - pythonVersion
  - requirementsHash (hash of `MediaCrawler/requirements.txt`)
- if marker missing or mismatch → recreate venv and install:
  - `python -m venv <venvPath>`
  - `<venvPython> -m pip install -U pip`
  - `<venvPython> -m pip install -r <requirements.txt>` (optionally `PIP_INDEX_URL` from spec)

- [ ] **Step 3: Add unit tests**

Tests use dependency injection for exec/spawn so不真正安装依赖，验证：
- marker mismatch triggers reinstall
- supported version passes, unsupported fails with suggestion

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/main/python desktop/electron/main/system/checkPython.ts
git commit -m "feat(python): add venv manager for mediacrawler"
```

---

### Task 4: Renderer templates + schema + submit path

**Files:**
- Create: `desktop/electron/renderer/src/features/task/templates/mediacrawlerTemplates.ts`
- Create: `desktop/electron/renderer/src/features/task/mediacrawlerSchema.ts`
- Modify: `desktop/electron/renderer/src/features/task/configSchema.ts`
- Modify: `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`
- Modify: `desktop/electron/renderer/src/features/task/TaskController.tsx`

- [ ] **Step 1: Define renderer schema**

Create `mediacrawlerSchema.ts` with zod schema for each kind, producing a payload matching main-side `MediaCrawlerTaskSpec`.

- [ ] **Step 2: Add built-in templates**

Create `mediacrawlerTemplates.ts`:
- dy_mvp default fields
- xhs_search default fields
- bili_search default fields

- [ ] **Step 3: Extend TaskConfig to support script=mediacrawler**

Update `configSchema.ts`:
- add `scriptEnum` include `'mediacrawler'`
- add `mediacrawler` object union keyed by `kind`

- [ ] **Step 4: Update TaskConfigForm UI**

Add template selector + conditional fields, and keep existing scripts as legacy section.

- [ ] **Step 5: Update TaskController submit**

If `cfg.script === 'mediacrawler'`:
- call `window.api.job.start({ runId, script: 'mediacrawler', args: [], env: {}, payload: <spec> })`
Else existing path.

This requires extending job.start API to accept `payload`.

- [ ] **Step 6: Commit**

```bash
git add desktop/electron/renderer/src/features/task
git commit -m "feat(task): add mediacrawler templates and schema"
```

---

### Task 5: IPC contract update (job.start supports payload) + preload types

**Files:**
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`
- Modify: `desktop/electron/main/index.ts`
- Test: `desktop/electron/shared/ipc.test.ts`

- [ ] **Step 1: Extend preload types**

Add:

```ts
export type JobStartRequest = { runId: string; script: string; args: string[]; env?: Record<string, string>; payload?: unknown }
export type JobStartResponse = { success: true; state: 'running' | 'queued'; position?: number } | { success: false; error: string }
```

- [ ] **Step 2: Wire through invoke**

`window.api.job.start(req)` passes req to main; main uses payload when script==mediacrawler.

- [ ] **Step 3: Tests**

Update ipc.test if needed for new channel payload typing.

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/shared/ipc.ts desktop/electron/preload/types.ts desktop/electron/preload/index.ts desktop/electron/main/index.ts
git commit -m "feat(job): support payload for mediacrawler"
```

---

### Task 6: Report markdown preview

**Files:**
- Create: `desktop/electron/renderer/src/features/report/MarkdownPreview.tsx`
- Modify: `desktop/electron/renderer/src/pages/ReportPage.tsx`
- Modify: `desktop/electron/main/index.ts` (new IPC read file)
- Modify: `desktop/electron/shared/ipc.ts` (new channel)

- [ ] **Step 1: Add IPC read-file limited to run output dir**

Create channel `runs:readFile`:
- only allow reading under `<userData>/results/runs/<runId>/`
- forbid path traversal

- [ ] **Step 2: Renderer MarkdownPreview**

Minimal renderer without external libs:
- render as `<pre>` in V1 (no markdown parsing) OR use existing markdown lib only if already in dependencies

- [ ] **Step 3: ReportPage tab**

If files exist, show “Report” tab and load content via IPC.

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/renderer/src/features/report desktop/electron/renderer/src/pages/ReportPage.tsx desktop/electron/main/index.ts desktop/electron/shared/ipc.ts
git commit -m "feat(report): add mediacrawler markdown preview"
```

---

### Task 7: Packaging (include MediaCrawler + runner script)

**Files:**
- Modify: `desktop/electron-builder.yml`

- [ ] **Step 1: Include MediaCrawler and runner**

Update `electron-builder.yml`:
- include `resources/python/**`
- include `MediaCrawler/**` as extraResources (or add to files include if building from repo root)

Expected:
- packaged app can locate `process.resourcesPath/MediaCrawler`
- packaged app can locate `process.resourcesPath/resources/python/run_mediacrawler.py`

- [ ] **Step 2: Commit**

```bash
git add desktop/electron-builder.yml desktop/resources/python/run_mediacrawler.py
git commit -m "ci(pack): bundle mediacrawler resources"
```

---

### Task 8: Gate checks

- [ ] Run: `cd /workspace/desktop && npm test`
- [ ] Run: `cd /workspace/desktop && npm run typecheck`

Expected: PASS

