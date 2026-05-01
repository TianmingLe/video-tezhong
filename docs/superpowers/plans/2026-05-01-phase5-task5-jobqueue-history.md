# Phase 5 Task 5 (JobQueue + History + KB Templates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Desktop 端实现并发队列（MAX=2）、进程树清理、任务历史持久化（electron-store）、ReportsPage 历史列表与 KB 模板保存/复用联动。

**Architecture:** 主进程引入 `JobQueue` 调度层（注入 Python runner + tree-kill），历史与模板使用 electron-store 持久化；IPC 仅暴露 `job/history/templates` 最小 API；渲染侧在 ReportsPage 展示历史，在 TaskConfigForm 提供保存模板，并在 KnowledgeBasePage 显示模板列表用于预填。

**Tech Stack:** Electron + TypeScript + vitest + electron-store + tree-kill

---

## 0. File Map

**Create**
- `desktop/electron/main/job/JobQueue.ts`
- `desktop/electron/main/job/JobQueue.test.ts`
- `desktop/electron/main/store/historyStore.ts`
- `desktop/electron/main/store/historyStore.test.ts`
- `desktop/electron/main/store/templatesStore.ts`
- `desktop/electron/main/store/templatesStore.test.ts`

**Modify**
- `desktop/package.json`
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/shared/ipc.test.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/main/process/PythonProcessManager.ts`
- `desktop/electron/renderer/src/pages/ReportsPage.tsx`
- `desktop/electron/renderer/src/features/kb/KnowledgeList.tsx`
- `desktop/electron/renderer/src/pages/KnowledgeBasePage.tsx`
- `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`

---

## Task 1: 安装依赖（electron-store + tree-kill）与 IPC 常量（TDD）

**Files**
- Modify: `desktop/package.json`
- Modify: `desktop/electron/shared/ipc.test.ts`
- Modify: `desktop/electron/shared/ipc.ts`

- [ ] **Step 1: Write failing test（新增 IPC channels）**

在 `desktop/electron/shared/ipc.test.ts` 增加断言：

```ts
expect(ipcChannels.historyList).toBe('history:list')
expect(ipcChannels.historyGet).toBe('history:get')
expect(ipcChannels.templatesList).toBe('templates:list')
expect(ipcChannels.templatesSave).toBe('templates:save')
```

- [ ] **Step 2: Run test to verify fails**

```bash
cd /workspace/desktop
npm test
```

- [ ] **Step 3: Implement channels**

在 `ipc.ts` 增加：

```ts
historyList: 'history:list',
historyGet: 'history:get',
templatesList: 'templates:list',
templatesSave: 'templates:save'
```

- [ ] **Step 4: Install deps**

```bash
cd /workspace/desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund electron-store tree-kill
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
git add desktop/package.json desktop/package-lock.json desktop/electron/shared/ipc.ts desktop/electron/shared/ipc.test.ts
git commit -m "feat(phase5): add history/templates ipc and deps"
```

---

## Task 2: JobQueue（TDD）+ tree-kill 注入

**Files**
- Create: `desktop/electron/main/job/JobQueue.test.ts`
- Create: `desktop/electron/main/job/JobQueue.ts`

- [ ] **Step 1: Write failing tests（并发=2、排队、退出唤醒、取消）**

`desktop/electron/main/job/JobQueue.test.ts`（示例骨架，实际按 TDD 拆多个 test）：

```ts
import { describe, expect, test, vi } from 'vitest'
import { JobQueue } from './JobQueue'

test('enqueue: third job queued when max=2', async () => {
  const start = vi.fn(async () => ({ pid: 1 }))
  const killTree = vi.fn(async () => {})
  const q = new JobQueue({ maxConcurrency: 2, start, killTree })

  const r1 = await q.enqueue({ runId: 'a', script: 'x', args: [], env: {}, meta: { scriptName: 'x', scenario: 's' } })
  const r2 = await q.enqueue({ runId: 'b', script: 'x', args: [], env: {}, meta: { scriptName: 'x', scenario: 's' } })
  const r3 = await q.enqueue({ runId: 'c', script: 'x', args: [], env: {}, meta: { scriptName: 'x', scenario: 's' } })

  expect(r1.state).toBe('running')
  expect(r2.state).toBe('running')
  expect(r3.state).toBe('queued')
})
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /workspace/desktop
npm test
```

- [ ] **Step 3: Minimal implementation**

`JobQueue` 需要提供：
- `enqueue(req)` → running/queued + position
- `cancel(runId)` → queued 移除 or running 调用 killTree
- `onExit(runId)` → running 释放并尝试启动队列头部
- `getSnapshot()` → { running: string[], queued: string[] }（便于调试/测试）

- [ ] **Step 4: Gate**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add desktop/electron/main/job
git commit -m "feat(phase5): add job queue with concurrency control"
```

---

## Task 3: HistoryStore（electron-store adapter 注入）（TDD）

**Files**
- Create: `desktop/electron/main/store/historyStore.test.ts`
- Create: `desktop/electron/main/store/historyStore.ts`

- [ ] **Step 1: Write failing tests（upsert/list/get）**
- [ ] **Step 2: Implement minimal store adapter interface**
- [ ] **Step 3: Gate**
- [ ] **Step 4: Commit**

---

## Task 4: TemplatesStore（electron-store adapter 注入）（TDD）

**Files**
- Create: `desktop/electron/main/store/templatesStore.test.ts`
- Create: `desktop/electron/main/store/templatesStore.ts`

- [ ] **Step 1: Write failing tests（save/list）**
- [ ] **Step 2: Implement minimal store**
- [ ] **Step 3: Gate**
- [ ] **Step 4: Commit**

---

## Task 5: IPC 接线（job.start/job.cancel 改由 JobQueue 管控 + history/templates）

**Files**
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`
- Modify: `desktop/electron/main/index.ts`

- [ ] **Step 1: 扩展 preload types（job.start 返回 queued/running；新增 history/templates API）**
- [ ] **Step 2: main 注册 ipcMain.handle(history/templates)**
- [ ] **Step 3: main 的 jobStart/jobCancel 改为 JobQueue.enqueue/cancel**
- [ ] **Step 4: job:status 扩展 queued/cancelled（并写入 history）**
- [ ] **Step 5: Gate + Commit**

---

## Task 6: Renderer：ReportsPage 历史列表 + KB 模板真实数据 + 保存模板按钮

**Files**
- Modify: `desktop/electron/renderer/src/pages/ReportsPage.tsx`
- Modify: `desktop/electron/renderer/src/features/kb/KnowledgeList.tsx`
- Modify: `desktop/electron/renderer/src/pages/KnowledgeBasePage.tsx`
- Modify: `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`

- [ ] **Step 1: ReportsPage 拉取 history.list 并展示**
- [ ] **Step 2: KB 从 templates.list 渲染，点击预填**
- [ ] **Step 3: TaskConfigForm 增加保存模板入口（最小 title 输入即可）**
- [ ] **Step 4: Gate + Commit**

---

## Task 7: 最终门禁 + 推送

- [ ] **Step 1: Gate**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 2: Push**

```bash
cd /workspace
git push origin trae/solo-agent-M3pw1t
```

