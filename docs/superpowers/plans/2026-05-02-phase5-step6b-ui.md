# Phase 5 Step 6B (UI Enhancements) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现队列状态实时看板（主进程推送，无轮询）、归档日志分块读取（大文件不阻塞）、以及统一 Skeleton 加载态；补强 SQLite busy 重试与只读降级策略。

**Architecture:** 主进程在 JobQueue 状态变更时 throttle 推送 `job:queueUpdate`；渲染侧通过 preload 提供 `job.onQueueUpdate` 订阅并写入 Context；ReportPage 通过 `job:getArchivedLog` 分块读取文件并配合现有虚拟滚动懒加载；新增 Skeleton 组件复用于各页面。

**Tech Stack:** TypeScript + Electron IPC + @tanstack/react-virtual + vitest

---

## 0. File Map

**Create**
- `desktop/electron/shared/ipc.queueUpdate.test.ts`（或合并到现有 ipc.test.ts）
- `desktop/electron/renderer/src/components/Skeleton.tsx`
- `desktop/electron/renderer/src/components/Skeleton.test.ts`
- `desktop/electron/renderer/src/features/job/QueueStatusContext.tsx`
- `desktop/electron/renderer/src/features/job/QueueStatusCard.tsx`
- `desktop/electron/renderer/src/features/job/QueueStatusCard.test.ts`
- `desktop/electron/main/logs/readArchivedLog.ts`
- `desktop/electron/main/logs/readArchivedLog.test.ts`

**Modify**
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/shared/ipc.test.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/main/job/jobRuntime.ts`
- `desktop/electron/main/db/index.ts`
- `desktop/electron/main/db/tasksRepo.ts`
- `desktop/electron/main/db/configsRepo.ts`
- `desktop/electron/renderer/src/app/layout/AppShell.tsx`
- `desktop/electron/renderer/src/pages/TasksPage.tsx`
- `desktop/electron/renderer/src/pages/ReportPage.tsx`
- `desktop/electron/renderer/src/pages/ReportsPage.tsx`
- `desktop/electron/renderer/src/pages/KnowledgeBasePage.tsx`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`
- `desktop/electron/renderer/src/styles.css`（新增 skeleton/transition）

---

## Task 1: IPC 扩展（queueUpdate + getArchivedLog）【TDD】

**Files**
- Modify: `desktop/electron/shared/ipc.test.ts`
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`

- [ ] **Step 1: Write failing test（ipcChannels 新增字段）**

在 `ipc.test.ts` 追加：

```ts
expect(ipcChannels.jobGetArchivedLog).toBe('job:getArchivedLog')
```

注：`job:queueUpdate` 为 push channel，不走 invoke，仍建议作为常量存在于 `ipcChannels` 里用于统一引用：

```ts
expect(ipcChannels.jobQueueUpdate).toBe('job:queueUpdate')
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /workspace/desktop
npm test
```

- [ ] **Step 3: Implement ipcChannels + preload types**

`preload/types.ts`：
- `job.onQueueUpdate(cb) -> off`
- `job.getArchivedLog(runId, offset, chunkSize)`

- [ ] **Step 4: Implement preload bridge**

`preload/index.ts`：
- `ipcRenderer.on(ipcChannels.jobQueueUpdate, handler)`
- `ipcRenderer.invoke(ipcChannels.jobGetArchivedLog, args)`

- [ ] **Step 5: Gate + Commit**

```bash
cd /workspace/desktop
npm test
npm run typecheck
cd /workspace
git add desktop/electron/shared/ipc.ts desktop/electron/shared/ipc.test.ts desktop/electron/preload/types.ts desktop/electron/preload/index.ts
git commit -m "feat(phase5): add queue update and archived log ipc"
```

---

## Task 2: 主进程 queueUpdate 推送（throttle 200ms）【TDD】

**Files**
- Modify: `desktop/electron/main/job/jobRuntime.ts`
- Modify: `desktop/electron/main/index.ts`

- [ ] **Step 1: Write failing test（throttle 合并）**

新增 `jobRuntime` 的可注入回调（`onQueueChange(payload)`），并用 vitest fake timers 验证 200ms 内多次变更只发 1 次。

- [ ] **Step 2: Implement throttle**

主进程维护：
- `pendingPayload: QueueUpdatePayload | null`
- `timer: NodeJS.Timeout | null`

触发时只更新 pendingPayload，若无 timer 则 `setTimeout(200ms)` flush：
- `BrowserWindow.getAllWindows().forEach(w => w.webContents.send('job:queueUpdate', payload))`

- [ ] **Step 3: Gate + Commit**

---

## Task 3: readArchivedLog（分块读取 + 安全校验 + 上限）【TDD】

**Files**
- Create: `desktop/electron/main/logs/readArchivedLog.ts`
- Create: `desktop/electron/main/logs/readArchivedLog.test.ts`
- Modify: `desktop/electron/main/index.ts`

- [ ] **Step 1: Write failing tests**

覆盖：
- 正常读取：offset=0 返回 text，nextOffset 增加
- EOF：offset>=size 返回 eof=true
- runId traversal：返回 success=false
- chunkSize 上限裁剪（例如传 10MB 也只读 256KB）

- [ ] **Step 2: Implement**

使用 `fs.openSync/readSync` 按字节读取；runId 校验复用 logArchive 的策略（或抽 shared util）。

- [ ] **Step 3: Wire IPC handler**

`ipcMain.handle('job:getArchivedLog', ...)`

- [ ] **Step 4: Gate + Commit**

---

## Task 4: QueueStatusContext + QueueStatusCard（无轮询）+ 乐观更新

**Files**
- Create: `renderer/src/features/job/QueueStatusContext.tsx`
- Create: `renderer/src/features/job/QueueStatusCard.tsx`
- Create tests: `QueueStatusCard.test.ts`（用 `react-dom/server` 断言文本）
- Modify: `renderer/src/app/layout/AppShell.tsx`
- Modify: `renderer/src/pages/TasksPage.tsx`
- Modify: `renderer/src/features/task/TaskController.tsx`（start/cancel 乐观置灰）

- [ ] **Step 1: Context wiring**
- [ ] **Step 2: Card UI（进度条 + pending 数）**
- [ ] **Step 3: Component tests**
- [ ] **Step 4: Gate + Commit**

---

## Task 5: ReportPage 归档日志懒加载（虚拟滚动复用）

**Files**
- Modify: `renderer/src/pages/ReportPage.tsx`
- Modify: `renderer/src/features/task/LogViewer.tsx`

- [ ] **Step 1: 初始加载 500 行**
- [ ] **Step 2: 滚动到底部触发加载下一块**
- [ ] **Step 3: Loading/Error/Retry UI**
- [ ] **Step 4: Gate + Commit**

---

## Task 6: Skeleton 组件 + 页面加载态统一

**Files**
- Create: `renderer/src/components/Skeleton.tsx`
- Create: `renderer/src/components/Skeleton.test.ts`
- Modify: `renderer/src/pages/ReportsPage.tsx`
- Modify: `renderer/src/pages/KnowledgeBasePage.tsx`
- Modify: `renderer/src/pages/SettingsPage.tsx`
- Modify: `renderer/src/styles.css`

- [ ] **Step 1: Add Skeleton + CSS**
- [ ] **Step 2: Replace “加载中...” 为 Skeleton**
- [ ] **Step 3: Tests**
- [ ] **Step 4: Gate + Commit**

---

## Task 7: SQLite busy 重试 + 只读降级（最小实现）

**Files**
- Modify: `main/db/index.ts`
- Modify: `main/db/tasksRepo.ts`
- Modify: `main/db/configsRepo.ts`

- [ ] **Step 1: db.pragma busy_timeout**
- [ ] **Step 2: 写操作重试 3 次（指数退避）**
- [ ] **Step 3: 失败标记只读（写返回 error，不 crash）**
- [ ] **Step 4: Gate + Commit**

---

## Task 8: 最终门禁 + 推送

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

