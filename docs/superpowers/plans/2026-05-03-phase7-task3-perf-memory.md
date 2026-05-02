# Phase 7 Task 3 (Perf + Memory) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将桌面端在 Beta 阶段做到“冷启动可观测 + 首屏更轻 + 日志内存受控 + 安全清理”：日志严格 10k 上限、路由懒加载并用 Suspense Skeleton 防白屏、采集冷启动链路指标、Settings 二次确认清理旧日志（保留最近 50）。

**Architecture:** renderer 引入纯函数 `logBuffer` 维护 `nextId/items`，分别由 TaskController 与 ReportPage 各自持有 nextIdRef；router 对非首屏页面使用 React.lazy + Suspense fallback；main 侧收集冷启动时间点并通过 IPC 暴露给 Settings 折叠面板；日志清理由 main 扫描 `<userData>/logs` 并提供 preview+cleanup IPC，Settings confirm 后执行。

**Tech Stack:** TypeScript + Electron + react-router-dom + vitest

---

## 0. File Map

**Create**
- `desktop/electron/renderer/src/features/task/logBuffer.ts`
- `desktop/electron/renderer/src/features/task/logBuffer.test.ts`
- `desktop/electron/main/perf/startupMetrics.ts`
- `desktop/electron/main/perf/startupMetrics.test.ts`
- `desktop/electron/main/logs/logCleanup.ts`
- `desktop/electron/main/logs/logCleanup.test.ts`

**Modify**
- `desktop/electron/renderer/src/features/task/TaskController.tsx`
- `desktop/electron/renderer/src/pages/ReportPage.tsx`
- `desktop/electron/renderer/src/app/router.tsx`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/shared/ipc.test.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`

---

### Task 3.1: 日志严格上限 10k（logBuffer + ID 单调性）（TDD）

**Files:**
- Create: `desktop/electron/renderer/src/features/task/logBuffer.ts`
- Test: `desktop/electron/renderer/src/features/task/logBuffer.test.ts`
- Modify: `desktop/electron/renderer/src/features/task/TaskController.tsx`
- Modify: `desktop/electron/renderer/src/pages/ReportPage.tsx`

- [ ] **Step 1: Write failing tests for logBuffer**

```ts
import { describe, expect, test } from 'vitest'
import { createLogBuffer, MAX_UI_LOG_LINES } from './logBuffer'

describe('logBuffer', () => {
  test('caps at MAX_UI_LOG_LINES and keeps id monotonic after truncation', () => {
    const buf = createLogBuffer()
    let state = buf.getInitialState()
    for (let i = 0; i < MAX_UI_LOG_LINES; i++) {
      state = buf.appendLine(state, `line-${i}`)
    }
    expect(state.items).toHaveLength(MAX_UI_LOG_LINES)
    expect(state.items[0]?.id).toBe(0)
    expect(state.items[MAX_UI_LOG_LINES - 1]?.id).toBe(MAX_UI_LOG_LINES - 1)

    state = buf.appendLine(state, 'line-next')
    expect(state.items).toHaveLength(MAX_UI_LOG_LINES)
    expect(state.items[0]?.id).toBe(1)
    expect(state.items[MAX_UI_LOG_LINES - 1]?.id).toBe(MAX_UI_LOG_LINES)
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run: `cd /workspace/desktop && npm test desktop/electron/renderer/src/features/task/logBuffer.test.ts`  
Expected: FAIL（module not found）

- [ ] **Step 3: Implement minimal logBuffer**

```ts
import { parseLogLine } from './logUtils'
import type { LogItem } from './logTypes'

export const MAX_UI_LOG_LINES = 10_000

export type LogBufferState = {
  nextId: number
  items: LogItem[]
}

export function createLogBuffer(args?: { maxLines?: number }) {
  const maxLines = typeof args?.maxLines === 'number' && Number.isFinite(args.maxLines) ? Math.max(1, Math.floor(args.maxLines)) : MAX_UI_LOG_LINES
  const getInitialState = (): LogBufferState => ({ nextId: 0, items: [] })

  const cap = (items: LogItem[]): LogItem[] => (items.length <= maxLines ? items : items.slice(items.length - maxLines))

  const appendLine = (state: LogBufferState, line: string): LogBufferState => {
    const it = parseLogLine(line, state.nextId)
    const nextItems = cap([...state.items, it])
    return { nextId: state.nextId + 1, items: nextItems }
  }

  const appendLines = (state: LogBufferState, lines: string[]): LogBufferState => {
    let s = state
    for (const line of lines) s = appendLine(s, line)
    return s
  }

  return { getInitialState, appendLine, appendLines }
}
```

- [ ] **Step 4: Add a second test asserting isolated nextId**

```ts
test('buffers are isolated (no shared counter)', () => {
  const b1 = createLogBuffer()
  const b2 = createLogBuffer()
  let s1 = b1.getInitialState()
  let s2 = b2.getInitialState()
  s1 = b1.appendLine(s1, 'a')
  s2 = b2.appendLine(s2, 'b')
  expect(s1.items[0]?.id).toBe(0)
  expect(s2.items[0]?.id).toBe(0)
})
```

- [ ] **Step 5: Wire TaskController with per-instance nextIdRef**

Change in `TaskController.tsx`:
- add `const nextIdRef = useRef(0)`
- on submit reset `nextIdRef.current = 0; setItems([])`
- onLog: `setItems(prev => { const id = nextIdRef.current++; const it = parseLogLine(line, id); const next = [...prev, it]; return next.length > 10000 ? next.slice(next.length - 10000) : next })`

- [ ] **Step 6: Wire ReportPage with per-instance nextIdRef**

Change in `ReportPage.tsx`:
- add `const nextIdRef = useRef(0)`
- in `loadInitial` reset `nextIdRef.current = 0; setLogs([])`
- in `appendLines` use `nextIdRef.current` to assign ids; cap to 10k

- [ ] **Step 7: Run full test & typecheck**

Run: `cd /workspace/desktop && npm test`  
Expected: PASS  
Run: `cd /workspace/desktop && npm run typecheck`  
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add desktop/electron/renderer/src/features/task/logBuffer.* desktop/electron/renderer/src/features/task/TaskController.tsx desktop/electron/renderer/src/pages/ReportPage.tsx
git commit -m "perf(renderer): cap ui logs at 10k with monotonic ids"
```

---

### Task 3.2: 路由懒加载（Suspense + Skeleton 防白屏）

**Files:**
- Modify: `desktop/electron/renderer/src/app/router.tsx`

- [ ] **Step 1: Switch heavy pages to React.lazy**

```ts
import React, { Suspense } from 'react'
import { Skeleton } from '../components/Skeleton'

const LazyKnowledgeBasePage = React.lazy(async () => {
  const m = await import('../pages/KnowledgeBasePage')
  return { default: m.KnowledgeBasePage }
})
```

- [ ] **Step 2: Wrap each lazy route element with Suspense fallback**

```tsx
const fb = (
  <div className="page">
    <Skeleton height={18} />
    <div style={{ height: 10 }} />
    <Skeleton height={14} />
    <div style={{ height: 10 }} />
    <Skeleton height={14} />
  </div>
)

{ path: 'kb', element: <Suspense fallback={fb}><LazyKnowledgeBasePage /></Suspense> }
```

- [ ] **Step 3: Run typecheck**

Run: `cd /workspace/desktop && npm run typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/renderer/src/app/router.tsx
git commit -m "perf(router): lazy load non-critical routes with suspense"
```

---

### Task 3.3: 冷启动指标采集（main → IPC → Settings 折叠面板）

**Files:**
- Create: `desktop/electron/main/perf/startupMetrics.ts`
- Test: `desktop/electron/main/perf/startupMetrics.test.ts`
- Modify: `desktop/electron/main/index.ts`
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`
- Modify: `desktop/electron/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write failing test for startupMetrics assembly**

```ts
import { describe, expect, test } from 'vitest'
import { createStartupMetrics } from './startupMetrics'

describe('startupMetrics', () => {
  test('computes deltas from t0', () => {
    const m = createStartupMetrics({ now: () => 100 })
    m.mark('whenReady', 110)
    m.mark('createWindow', 120)
    const snap = m.getSnapshot()
    expect(snap.t0).toBe(100)
    expect(snap.marks.whenReady).toBe(110)
    expect(snap.deltas.whenReadyMs).toBe(10)
    expect(snap.deltas.createWindowMs).toBe(20)
  })
})
```

- [ ] **Step 2: Implement startupMetrics**
- [ ] **Step 3: Wire marks in main/index.ts**
  - t0 at module init
  - mark whenReady inside `app.whenReady().then`
  - mark createWindow inside `createMainWindow()` right after BrowserWindow construction
  - attach `did-finish-load` and `ready-to-show` listeners inside createMainWindow
- [ ] **Step 4: Add IPC `perf:getStartup`**
  - return snapshot `{ t0, marks, deltas }`
- [ ] **Step 5: Preload expose `api.perf.getStartup()`**
- [ ] **Step 6: Settings add `<details>` “开发者指标”**
  - 打开时调用 `api.perf.getStartup()` 并展示各阶段耗时（ms）
- [ ] **Step 7: Run full test & typecheck**
- [ ] **Step 8: Commit**

```bash
git add desktop/electron/main/perf/startupMetrics.* desktop/electron/main/index.ts desktop/electron/shared/ipc.ts desktop/electron/preload/* desktop/electron/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(perf): collect startup metrics and expose in settings"
```

---

### Task 3.4: 安全清理旧日志（preview + confirm + cleanup）（TDD）

**Files:**
- Create: `desktop/electron/main/logs/logCleanup.ts`
- Test: `desktop/electron/main/logs/logCleanup.test.ts`
- Modify: `desktop/electron/main/index.ts`
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`
- Modify: `desktop/electron/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write failing tests for cleanup logic**

```ts
import { describe, expect, test } from 'vitest'
import { createLogCleanup } from './logCleanup'

describe('logCleanup', () => {
  test('keeps latest 50 by mtime and deletes older .log only', () => {
    const deleted: string[] = []
    const fs = {
      readdirSync: () => Array.from({ length: 60 }).map((_, i) => `r${i}.log`).concat(['x.txt']),
      statSync: (p: string) => ({ mtimeMs: Number(p.match(/r(\\d+)/)?.[1] ?? 0) } as never),
      unlinkSync: (p: string) => void deleted.push(p)
    }
    const c = createLogCleanup({ userDataPath: '/u', fs: fs as never })
    const preview = c.preview({ keep: 50 })
    expect(preview.toDelete).toBe(10)
    const res = c.cleanup({ keep: 50 })
    expect(res.deleted).toBe(10)
  })
})
```

- [ ] **Step 2: Implement preview/cleanup**
  - scan `<userData>/logs`
  - filter `*.log`
  - sort by `mtimeMs desc`
  - compute `toDelete = max(0, total-keep)`
  - delete only computed older files
- [ ] **Step 3: Add IPC**
  - `logs:cleanupPreview` → `{ toDelete: number }`
  - `logs:cleanup` → `{ success: true; deleted: number } | { success: false; error: string }`
- [ ] **Step 4: Preload expose `api.logs.cleanupPreview/cleanup`**
- [ ] **Step 5: Settings add “清理旧日志” button**
  - click → await preview → `window.confirm` with N → if confirm then call cleanup → toast show result
- [ ] **Step 6: Run full test & typecheck**
- [ ] **Step 7: Commit**

```bash
git add desktop/electron/main/logs/logCleanup.* desktop/electron/main/index.ts desktop/electron/shared/ipc.ts desktop/electron/preload/* desktop/electron/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(logs): add safe cleanup with preview and confirmation"
```

---

## Task 3 Gate

- [ ] `cd /workspace/desktop && npm test`
- [ ] `cd /workspace/desktop && npm run typecheck`
- [ ] `cd /workspace/desktop && npm run validate:yaml`

