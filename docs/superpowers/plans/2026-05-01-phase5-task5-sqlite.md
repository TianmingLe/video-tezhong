# Phase 5 Task 5 (SQLite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Task 5 从 electron-store 迁移为 SQLite（better-sqlite3），并实现 JobQueue 并发控制（MAX=2）、tree-kill 进程树清理、tasks/configs 持久化、日志按 runId 归档，以及 Reports/KB 联动 UI。

**Architecture:** 主进程引入 DB 单例（better-sqlite3）+ repos（tasks/configs）+ logArchive；JobQueue 作为 job.start/cancel 唯一入口并驱动 tasks 状态；渲染进程通过最小 IPC（job.queueStatus/job.history/kb.listConfigs/kb.saveConfig）读取展示与保存模板。

**Tech Stack:** TypeScript + Electron + vitest + better-sqlite3 + tree-kill

---

## 0. File Map

**Create**
- `desktop/electron/main/db/schema.sql`
- `desktop/electron/main/db/index.ts`
- `desktop/electron/main/db/index.test.ts`
- `desktop/electron/main/db/tasksRepo.ts`
- `desktop/electron/main/db/tasksRepo.test.ts`
- `desktop/electron/main/db/configsRepo.ts`
- `desktop/electron/main/db/configsRepo.test.ts`
- `desktop/electron/main/logArchive.ts`
- `desktop/electron/main/logArchive.test.ts`
- `desktop/electron/main/ipc/sqliteIpc.ts`

**Modify**
- `desktop/package.json` / `desktop/package-lock.json`
- `desktop/electron/shared/ipc.ts` / `ipc.test.ts`
- `desktop/electron/preload/types.ts` / `preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/main/process/PythonProcessManager.ts`
- `desktop/electron/main/job/JobQueue.ts` / `JobQueue.test.ts`（从注入式升级为接入 pid + 事件）
- `desktop/electron/renderer/src/pages/ReportsPage.tsx`
- `desktop/electron/renderer/src/features/kb/KnowledgeList.tsx`
- `desktop/electron/renderer/src/features/kb/mockKnowledge.ts`（删除或停止引用）
- `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`

**Delete**
- `desktop/electron/main/store/historyStore.ts`
- `desktop/electron/main/store/historyStore.test.ts`
- `desktop/electron/main/store/templatesStore.ts`
- `desktop/electron/main/store/templatesStore.test.ts`

---

## Task 1: Step 1（db/schema + db/index + 单测）【你要求从这里开始】

**Files**
- Create: `desktop/electron/main/db/schema.sql`
- Create: `desktop/electron/main/db/index.test.ts`
- Create: `desktop/electron/main/db/index.ts`
- Modify: `desktop/package.json` / `desktop/package-lock.json`

- [ ] **Step 1: Write failing test（initDb 自动建表 + 可插入查询）**

`desktop/electron/main/db/index.test.ts`：

```ts
import { afterEach, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDbForTest, initDb } from './index'

let tmpFile: string | null = null
afterEach(() => {
  if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  tmpFile = null
})

test('initDb creates tables and supports insert/select', () => {
  tmpFile = path.join(os.tmpdir(), `omni-${Date.now()}-${Math.random()}.db`)
  const db = createDbForTest(tmpFile)
  initDb(db)

  db.prepare('insert into tasks(run_id, script, scenario, status) values(?,?,?,?)').run('r1', 's.py', 'normal', 'running')
  const row = db.prepare('select run_id, status from tasks where run_id=?').get('r1') as any
  expect(row.run_id).toBe('r1')
  expect(row.status).toBe('running')
})
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /workspace/desktop
npm test
```

- [ ] **Step 3: Add schema.sql + minimal db wrapper**

`schema.sql`（按 spec 的两张表，CREATE IF NOT EXISTS）。

`index.ts` 导出：
- `createDbForTest(filePath)`（只用于测试）
- `getDb()`（生产单例）
- `initDb(db)`（读取 schema.sql 并执行）

- [ ] **Step 4: Add dependency (better-sqlite3) + remove electron-store**

```bash
cd /workspace/desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund better-sqlite3 tree-kill
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm remove electron-store
```

- [ ] **Step 5: Gate**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
cd /workspace
git add desktop/package.json desktop/package-lock.json desktop/electron/main/db
git commit -m "feat(phase5): add sqlite db schema and wrapper"
```

---

## Task 2: tasksRepo/configsRepo（TDD）

为 tasks/configs 各写 1 个 failing test，再实现最小 SQL。

---

## Task 3: logArchive（TDD）

实现 `<userData>/logs/<runId>.log` 的 append/read/export，并写单测（用 temp dir）。

---

## Task 4: JobQueue 接入 PID + tree-kill（TDD）

将当前 JobQueue 从注入式 runner 扩展为：
- start 返回 pid
- cancel running 调用 tree-kill(pid,'SIGKILL')
- exit 时拉起下一任务

---

## Task 5: IPC 重构（删 history/templates，改 sqliteIpc）

新增：
- `job:queueStatus`
- `job:history`
- `kb:listConfigs`
- `kb:saveConfig`

并删除：
- `history:*`
- `templates:*`

---

## Task 6: Renderer UI 联动

- ReportsPage：历史 tasks 列表 + 过滤 + 跳转
- KnowledgeList：configs 列表 + 点击预填
- TaskConfigForm：保存为模板（kb.saveConfig）

---

## Task 7: 清理与最终门禁

- 删除 `main/store/*`
- `npm test` + `npm run typecheck`
- push

