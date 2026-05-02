# Phase 5 Step 6B - Part 3 (Reliability) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加 SQLite 锁竞争重试与只读降级，并统一前端失败重试交互（RetryButton），使桌面端在磁盘/权限/锁冲突场景下不崩溃且用户可恢复操作。

**Architecture:** db/index.ts 提供 runWithRetry（同步指数退避）与 openDbWithFallback（RW→RO）并暴露 dbState；主进程通过 app:notify 推送只读告警；渲染端通过 app.getDbState 初始化只读标志并禁用写操作；RetryButton 封装重试 UI 并接入 ReportPage/SettingsPage。

**Tech Stack:** TypeScript + Electron IPC + vitest + better-sqlite3

---

## 0. File Map

**Create**
- `desktop/electron/main/db/retry.test.ts`
- `desktop/electron/renderer/src/components/RetryButton.tsx`
- `desktop/electron/renderer/src/components/RetryButton.test.tsx`

**Modify**
- `desktop/electron/main/db/index.ts`
- `desktop/electron/main/db/tasksRepo.ts`
- `desktop/electron/main/db/configsRepo.ts`
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/shared/ipc.test.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/renderer/src/app/layout/AppShell.tsx`
- `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`
- `desktop/electron/renderer/src/pages/ReportPage.tsx`

---

## Task 1: db.runWithRetry（TDD）

**Files**
- Create: `desktop/electron/main/db/retry.test.ts`
- Modify: `desktop/electron/main/db/index.ts`

- [ ] **Step 1: Write failing test（busy 重试 + 退避）**

`retry.test.ts`：

```ts
import { expect, test, vi } from 'vitest'
import { createRetryRunner } from './index'

test('runWithRetry retries SQLITE_BUSY with exponential backoff', () => {
  const sleep = vi.fn()
  const runWithRetry = createRetryRunner({ sleep }).runWithRetry
  let n = 0
  const fn = () => {
    n += 1
    if (n < 3) {
      const err = new Error('database is locked')
      ;(err as any).code = 'SQLITE_BUSY'
      throw err
    }
    return 42
  }
  const out = runWithRetry(fn, 3)
  expect(out).toBe(42)
  expect(sleep).toHaveBeenCalledTimes(2)
  expect(sleep).toHaveBeenNthCalledWith(1, 50)
  expect(sleep).toHaveBeenNthCalledWith(2, 100)
})
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /workspace/desktop
npm test electron/main/db/retry.test.ts
```

- [ ] **Step 3: Implement createRetryRunner + runWithRetry**

`index.ts` 导出：
- `createRetryRunner({ sleep })`（默认 sleepSync）
- `runWithRetry(fn, retries)`

- [ ] **Step 4: Gate + Commit**

---

## Task 2: openDbWithFallback（RW→RO）+ app:notify（TDD minimal）

**Files**
- Modify: `desktop/electron/main/db/index.ts`
- Modify: `desktop/electron/shared/ipc.ts` / `ipc.test.ts`
- Modify: `desktop/electron/preload/types.ts` / `preload/index.ts`
- Modify: `desktop/electron/main/index.ts`

- [ ] **Step 1: Add ipcChannels.appNotify + appGetDbState**
- [ ] **Step 2: preload 暴露 app.onNotify + app.getDbState**
- [ ] **Step 3: DB open 失败时 fallback readonly 并标记 dbState.isReadOnly**
- [ ] **Step 4: main 启动后若只读则发送一次 app:notify warning**
- [ ] **Step 5: Gate + Commit**

---

## Task 3: repos 写操作接入 runWithRetry（TDD 保持现有 test 全绿）

**Files**
- Modify: `desktop/electron/main/db/tasksRepo.ts`
- Modify: `desktop/electron/main/db/configsRepo.ts`

- [ ] **Step 1: 将 insert/updateStatus/update/setDefault 的 .run 包裹进 runWithRetry**
- [ ] **Step 2: Gate + Commit**

---

## Task 4: RetryButton + 接入 ReportPage/SettingsPage（TDD）

**Files**
- Create: `desktop/electron/renderer/src/components/RetryButton.tsx`
- Create: `desktop/electron/renderer/src/components/RetryButton.test.tsx`
- Modify: `desktop/electron/renderer/src/pages/ReportPage.tsx`
- Modify: `desktop/electron/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write failing test（渲染 label）**
- [ ] **Step 2: Implement RetryButton（loading/error）**
- [ ] **Step 3: 接入 ReportPage：归档日志 error 显示 RetryButton**
- [ ] **Step 4: 接入 SettingsPage：kb.save/kb.setDefault error 显示 RetryButton**
- [ ] **Step 5: Gate + Commit**

---

## Task 5: 只读 UI 降级（TaskConfigForm/SettingsPage）

**Files**
- Modify: `desktop/electron/renderer/src/app/layout/AppShell.tsx`
- Modify: `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`
- Modify: `desktop/electron/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: AppShell 初始化读取 app.getDbState 并提供只读标志（context 或 prop）**
- [ ] **Step 2: 只读时禁用“保存为模板/设为默认”等写按钮并设置 title**
- [ ] **Step 3: Gate + Commit**

---

## Task 6: 最终门禁 + 推送

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

