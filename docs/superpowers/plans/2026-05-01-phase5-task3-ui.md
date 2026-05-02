# Phase 5 Task 3 (Desktop UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 渲染进程实现任务配置 / 实时控制台（虚拟滚动）/ 报告联动 / 知识库列表的产品级闭环，并通过 IPC 完整联动主进程 job 生命周期（含 onStatus 与 exportLog）。

**Architecture:** React Router 管理页面路由（方案 A），左侧导航常驻；TaskController 作为任务执行编排层（表单提交→spawn→日志订阅→退出→自动跳转报告页）。LogViewer 使用虚拟滚动与智能跟随滚动策略保障大日志性能；渲染层不接触 fs/child_process，所有导出通过 preload→IPC→主进程 dialog 实现。

**Tech Stack:** electron-vite + React 18 + TypeScript + react-router-dom + react-hook-form + zod + @hookform/resolvers + @tanstack/react-virtual + vitest

---

## 0. File Map（将创建/修改的文件）

**Create**
- `desktop/electron/renderer/src/app/layout/AppShell.tsx`
- `desktop/electron/renderer/src/app/layout/SidebarNav.tsx`
- `desktop/electron/renderer/src/app/layout/shell.css`
- `desktop/electron/renderer/src/app/router.tsx`
- `desktop/electron/renderer/src/features/task/configSchema.ts`
- `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`
- `desktop/electron/renderer/src/features/task/TaskController.tsx`
- `desktop/electron/renderer/src/features/task/LogViewer.tsx`
- `desktop/electron/renderer/src/features/task/logTypes.ts`
- `desktop/electron/renderer/src/features/task/logUtils.ts`
- `desktop/electron/renderer/src/features/task/logUtils.test.ts`
- `desktop/electron/renderer/src/features/task/configSchema.test.ts`
- `desktop/electron/renderer/src/features/kb/KnowledgeList.tsx`
- `desktop/electron/renderer/src/features/kb/mockKnowledge.ts`
- `desktop/electron/renderer/src/pages/TasksPage.tsx`
- `desktop/electron/renderer/src/pages/ConsolePage.tsx`
- `desktop/electron/renderer/src/pages/ReportsPage.tsx`
- `desktop/electron/renderer/src/pages/ReportPage.tsx`
- `desktop/electron/renderer/src/pages/KnowledgeBasePage.tsx`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`

**Modify**
- `desktop/package.json`
- `desktop/electron/renderer/src/main.tsx`
- `desktop/electron/renderer/src/styles.css`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/shared/ipc.test.ts`
- `desktop/electron/main/index.ts`

---

## Task 1: 依赖安装 + Router 基建（方案 A）

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/electron/renderer/src/main.tsx`
- Create: `desktop/electron/renderer/src/app/router.tsx`
- Create: `desktop/electron/renderer/src/app/layout/AppShell.tsx`
- Create: `desktop/electron/renderer/src/app/layout/SidebarNav.tsx`
- Create: `desktop/electron/renderer/src/app/layout/shell.css`

- [ ] **Step 1: 写失败测试（schema/log 未引入前，此任务不写测试）**

- [ ] **Step 2: 安装依赖**

Run:
```bash
cd /workspace/desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund react-router-dom react-hook-form zod @hookform/resolvers @tanstack/react-virtual
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund -D @types/react-router-dom
```

Expected:
- `package.json` 中出现上述依赖条目

- [ ] **Step 3: 实现 Router 与 AppShell（最小可渲染）**

`desktop/electron/renderer/src/main.tsx` 变更为渲染 `<AppRouter />`：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppRouter } from './app/router'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
)
```

`desktop/electron/renderer/src/app/router.tsx`：

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { TasksPage } from '../pages/TasksPage'
import { ConsolePage } from '../pages/ConsolePage'
import { ReportsPage } from '../pages/ReportsPage'
import { ReportPage } from '../pages/ReportPage'
import { KnowledgeBasePage } from '../pages/KnowledgeBasePage'
import { SettingsPage } from '../pages/SettingsPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TasksPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'console', element: <ConsolePage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'report/:runId', element: <ReportPage /> },
      { path: 'kb', element: <KnowledgeBasePage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
```

`desktop/electron/renderer/src/app/layout/AppShell.tsx`：

```tsx
import { Outlet } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import './shell.css'

export function AppShell() {
  return (
    <div className="shell">
      <SidebarNav />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
```

`desktop/electron/renderer/src/app/layout/SidebarNav.tsx`：

```tsx
import { NavLink } from 'react-router-dom'

const items: Array<{ to: string; label: string }> = [
  { to: '/tasks', label: '任务' },
  { to: '/console', label: '控制台' },
  { to: '/reports', label: '报告' },
  { to: '/kb', label: '知识库' },
  { to: '/settings', label: '设置' }
]

export function SidebarNav() {
  return (
    <aside className="nav">
      <div className="brand">
        <div className="brand-title">OmniScraper</div>
        <div className="brand-subtitle">Desktop</div>
      </div>
      <div className="nav-items">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) => (isActive ? 'nav-item nav-item-active' : 'nav-item')}
          >
            <span className="nav-item-label">{it.label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
```

`desktop/electron/renderer/src/app/layout/shell.css`：

```css
.shell {
  display: grid;
  grid-template-columns: 260px 1fr;
  height: 100vh;
}

.nav {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  padding: 20px 14px;
  background: #0a0d12;
}

.brand {
  padding: 10px 10px 18px;
}

.brand-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.brand-subtitle {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.7;
}

.nav-items {
  display: grid;
  gap: 6px;
}

.nav-item {
  display: block;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: inherit;
  border-radius: 10px;
  padding: 10px 10px;
}

.nav-item-active {
  background: rgba(131, 170, 255, 0.12);
  border-color: rgba(131, 170, 255, 0.35);
}

.nav-item-label {
  font-size: 14px;
}

.main {
  padding: 28px 28px;
}
```

- [ ] **Step 4: typecheck**

Run:
```bash
cd /workspace/desktop
npm run typecheck
```

Expected: success

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add desktop/package.json desktop/package-lock.json desktop/electron/renderer/src/main.tsx desktop/electron/renderer/src/app
git commit -m "feat(phase5): add router and app shell"
```

---

## Task 2: IPC 扩展（onStatus + exportLog），保持 renderer 无 fs

**Files:**
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/shared/ipc.test.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`
- Modify: `desktop/electron/main/index.ts`

- [ ] **Step 1: 写失败测试（IPC channel 常量稳定性）**

在 `desktop/electron/shared/ipc.test.ts` 增加断言：

```ts
import { describe, expect, test } from 'vitest'
import { ipcChannels } from './ipc'

describe('ipcChannels', () => {
  test('has stable channel names', () => {
    expect(ipcChannels.jobLog).toBe('job:log')
    expect(ipcChannels.jobStatus).toBe('job:status')
    expect(ipcChannels.jobStart).toBe('job:start')
    expect(ipcChannels.jobCancel).toBe('job:cancel')
    expect(ipcChannels.jobExportLog).toBe('job:exportLog')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/desktop
npm test
```

Expected: FAIL（`jobExportLog` 不存在）

- [ ] **Step 3: 实现最小代码（新增 channel + preload API）**

`desktop/electron/shared/ipc.ts`：

```ts
export const ipcChannels = {
  jobLog: 'job:log',
  jobStatus: 'job:status',
  jobStart: 'job:start',
  jobCancel: 'job:cancel',
  jobExportLog: 'job:exportLog'
} as const
```

`desktop/electron/preload/types.ts` 扩展 `job`：

```ts
export type JobStatusEvent =
  | { runId: string; status: 'started'; pid: number }
  | { runId: string; status: 'exited'; code: number | null; signal: string | null }
  | { runId: string; status: 'error'; error: string }

export type ExportLogResult = { success: true } | { success: false; error: string }

export type DesktopApi = {
  version: string
  job: {
    start: (config: JobConfig) => Promise<JobStartResult>
    cancel: (runId: string) => Promise<{ success: boolean }>
    onLog: (runId: string, callback: (line: string) => void) => () => void
    onStatus: (runId: string, callback: (ev: JobStatusEvent) => void) => () => void
    exportLog: (runId: string) => Promise<ExportLogResult>
  }
}
```

`desktop/electron/preload/index.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from './types'
import { ipcChannels } from '@shared/ipc'

const api: DesktopApi = {
  version: '0.0.1',
  job: {
    start: async (config) => await ipcRenderer.invoke(ipcChannels.jobStart, config),
    cancel: async (runId) => await ipcRenderer.invoke(ipcChannels.jobCancel, runId),
    onLog: (runId, callback) => {
      const handler = (_evt: unknown, payload: { runId: string; line: string }) => {
        if (payload.runId === runId) callback(payload.line)
      }
      ipcRenderer.on(ipcChannels.jobLog, handler as never)
      return () => ipcRenderer.removeListener(ipcChannels.jobLog, handler as never)
    },
    onStatus: (runId, callback) => {
      const handler = (_evt: unknown, payload: { runId: string }) => {
        if (payload.runId === runId) callback(payload as never)
      }
      ipcRenderer.on(ipcChannels.jobStatus, handler as never)
      return () => ipcRenderer.removeListener(ipcChannels.jobStatus, handler as never)
    },
    exportLog: async (runId) => await ipcRenderer.invoke(ipcChannels.jobExportLog, runId)
  }
}

contextBridge.exposeInMainWorld('api', api)
```

`desktop/electron/main/index.ts` 增加主进程导出处理（使用 dialog，避免 renderer fs）：

```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import { ipcChannels } from '@shared/ipc'

ipcMain.handle(ipcChannels.jobExportLog, async (_evt, runId: string) => {
  const logs = processManager.getLogs(runId).join('\n') + '\n'
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出日志',
    defaultPath: `${runId}.log`,
    filters: [{ name: 'Log', extensions: ['log', 'txt'] }]
  })
  if (canceled || !filePath) return { success: false, error: 'cancelled' }
  try {
    fs.writeFileSync(filePath, logs, 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: String((e as Error).message || e) }
  }
})
```

- [ ] **Step 4: Run tests and typecheck**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

Expected: all green

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add desktop/electron/shared/ipc.ts desktop/electron/shared/ipc.test.ts desktop/electron/preload/types.ts desktop/electron/preload/index.ts desktop/electron/main/index.ts
git commit -m "feat(phase5): add onStatus and exportLog ipc api"
```

---

## Task 3: TaskConfigForm（react-hook-form + zod）与 schema 单测（TDD）

**Files:**
- Create: `desktop/electron/renderer/src/features/task/configSchema.ts`
- Create: `desktop/electron/renderer/src/features/task/configSchema.test.ts`
- Create: `desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`

- [ ] **Step 1: Write failing test（schema 校验）**

`desktop/electron/renderer/src/features/task/configSchema.test.ts`：

```ts
import { describe, expect, test } from 'vitest'
import { taskConfigSchema } from './configSchema'

describe('taskConfigSchema', () => {
  test('rejects invalid script', () => {
    const r = taskConfigSchema.safeParse({
      runId: '',
      script: 'bad.py',
      scenario: 'normal',
      gatewayWs: '',
      env: {},
      advanced: { logLevel: 'info', maxLogLines: 1000, autoJumpToReport: true }
    })
    expect(r.success).toBe(false)
  })

  test('accepts minimal valid payload', () => {
    const r = taskConfigSchema.safeParse({
      runId: '',
      script: 'mock_device.py',
      scenario: 'normal',
      gatewayWs: '',
      env: {},
      advanced: { logLevel: 'info', maxLogLines: 1000, autoJumpToReport: true }
    })
    expect(r.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify fails**

```bash
cd /workspace/desktop
npm test
```

Expected: FAIL（`taskConfigSchema` 不存在）

- [ ] **Step 3: Implement schema**

`desktop/electron/renderer/src/features/task/configSchema.ts`：

```ts
import { z } from 'zod'

export const scriptEnum = z.enum(['mock_device.py', 'firmware_build.py', 'e2e_test.py'])
export const logLevelEnum = z.enum(['info', 'warn', 'error'])

export const taskConfigSchema = z.object({
  runId: z.string().optional().default(''),
  script: scriptEnum,
  scenario: z.string().min(1),
  gatewayWs: z.string().optional().default(''),
  env: z.record(z.string()).default({}),
  advanced: z.object({
    logLevel: logLevelEnum.default('info'),
    maxLogLines: z.number().int().min(100).max(10000).default(1000),
    autoJumpToReport: z.boolean().default(true)
  })
})

export type TaskConfig = z.infer<typeof taskConfigSchema>
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd /workspace/desktop
npm test
```

Expected: schema tests pass

- [ ] **Step 5: Implement TaskConfigForm（最小 UI + 精确错误提示）**

`desktop/electron/renderer/src/features/task/TaskConfigForm.tsx`（核心要点：zodResolver、生成 runId、env 编辑器最小形态）：

```tsx
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { TaskConfig, taskConfigSchema, scriptEnum } from './configSchema'

export type TaskConfigFormProps = {
  defaultValues?: Partial<TaskConfig>
  onSubmit: (cfg: TaskConfig) => void
}

const scriptOptions = scriptEnum.options

export function TaskConfigForm(props: TaskConfigFormProps) {
  const defaults = useMemo<TaskConfig>(() => {
    const merged = taskConfigSchema.parse({
      runId: props.defaultValues?.runId ?? '',
      script: props.defaultValues?.script ?? 'mock_device.py',
      scenario: props.defaultValues?.scenario ?? 'normal',
      gatewayWs: props.defaultValues?.gatewayWs ?? '',
      env: props.defaultValues?.env ?? {},
      advanced: {
        logLevel: props.defaultValues?.advanced?.logLevel ?? 'info',
        maxLogLines: props.defaultValues?.advanced?.maxLogLines ?? 1000,
        autoJumpToReport: props.defaultValues?.advanced?.autoJumpToReport ?? true
      }
    })
    return merged
  }, [props.defaultValues])

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<TaskConfig>({
    resolver: zodResolver(taskConfigSchema),
    defaultValues: defaults
  })

  const env = watch('env')
  const envKeys = Object.keys(env || {})

  const submit = (v: TaskConfig) => {
    const runId = (v.runId || '').trim() || crypto.randomUUID()
    const finalCfg = { ...v, runId }
    setValue('runId', runId, { shouldDirty: true })
    props.onSubmit(finalCfg)
  }

  const addEnv = () => {
    const key = `KEY_${envKeys.length + 1}`
    setValue(`env.${key}` as const, '')
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="card">
      <div className="row">
        <label className="label">RunID</label>
        <input className="input" placeholder="留空自动生成" {...register('runId')} />
        {errors.runId && <div className="error">{errors.runId.message}</div>}
      </div>

      <div className="row">
        <label className="label">脚本</label>
        <select className="input" {...register('script')}>
          {scriptOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errors.script && <div className="error">{errors.script.message}</div>}
      </div>

      <div className="row">
        <label className="label">场景</label>
        <input className="input" {...register('scenario')} />
        {errors.scenario && <div className="error">{errors.scenario.message}</div>}
      </div>

      <div className="row">
        <label className="label">Gateway WS</label>
        <input className="input" placeholder="ws://..." {...register('gatewayWs')} />
      </div>

      <div className="row">
        <label className="label">高级</label>
        <div className="grid2">
          <label className="inline">
            <span>日志级别</span>
            <select className="input" {...register('advanced.logLevel')}>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>
          <label className="inline">
            <span>缓存行数</span>
            <input className="input" type="number" {...register('advanced.maxLogLines', { valueAsNumber: true })} />
          </label>
          <label className="inline">
            <span>自动跳转报告</span>
            <input type="checkbox" {...register('advanced.autoJumpToReport')} />
          </label>
        </div>
      </div>

      <div className="row">
        <label className="label">环境变量</label>
        <div className="env">
          <button type="button" className="btn" onClick={addEnv}>
            + 添加
          </button>
          {envKeys.length === 0 && <div className="muted">暂无</div>}
          {envKeys.map((k) => (
            <div key={k} className="env-row">
              <div className="env-key">{k}</div>
              <input className="input" {...register(`env.${k}` as const)} />
            </div>
          ))}
        </div>
      </div>

      <div className="row">
        <button type="submit" className="btn">
          开始任务
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 6: Run tests + typecheck**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
cd /workspace
git add desktop/electron/renderer/src/features/task/configSchema.ts desktop/electron/renderer/src/features/task/configSchema.test.ts desktop/electron/renderer/src/features/task/TaskConfigForm.tsx
git commit -m "feat(phase5): add task config form with zod validation"
```

---

## Task 4: LogViewer（虚拟滚动 + 分级高亮 + 搜索过滤 + 智能滚动）+ log utils 单测（TDD）

**Files:**
- Create: `desktop/electron/renderer/src/features/task/logTypes.ts`
- Create: `desktop/electron/renderer/src/features/task/logUtils.ts`
- Create: `desktop/electron/renderer/src/features/task/logUtils.test.ts`
- Create: `desktop/electron/renderer/src/features/task/LogViewer.tsx`

- [ ] **Step 1: Write failing tests（日志解析与过滤）**

`desktop/electron/renderer/src/features/task/logUtils.test.ts`：

```ts
import { describe, expect, test } from 'vitest'
import { parseLogLine, filterLogs } from './logUtils'

test('parseLogLine parses json', () => {
  const line = JSON.stringify({ ts: 1, level: 'warn', msg: 'x' })
  const r = parseLogLine(line, 0)
  expect(r.kind).toBe('json')
  if (r.kind !== 'json') throw new Error('not json')
  expect(r.level).toBe('warn')
})

test('parseLogLine falls back to text', () => {
  const r = parseLogLine('hello', 0)
  expect(r.kind).toBe('text')
})

test('filterLogs filters by level and keyword', () => {
  const logs = [
    parseLogLine(JSON.stringify({ level: 'info', msg: 'a' }), 0),
    parseLogLine(JSON.stringify({ level: 'error', msg: 'boom' }), 1)
  ]
  const r1 = filterLogs(logs, { level: 'error', keyword: '' })
  expect(r1.length).toBe(1)
  const r2 = filterLogs(logs, { level: 'all', keyword: 'boom' })
  expect(r2.length).toBe(1)
})
```

- [ ] **Step 2: Run test to verify fails**

```bash
cd /workspace/desktop
npm test
```

Expected: FAIL（`logUtils` 不存在）

- [ ] **Step 3: Implement minimal log utils**

`desktop/electron/renderer/src/features/task/logTypes.ts`：

```ts
export type LogLevel = 'info' | 'warn' | 'error'

export type LogItem =
  | { id: number; kind: 'text'; raw: string; ts: number }
  | { id: number; kind: 'json'; raw: string; ts: number; level: LogLevel; msg: string; traceId?: string }

export type LogFilter = {
  level: 'all' | LogLevel
  keyword: string
}
```

`desktop/electron/renderer/src/features/task/logUtils.ts`：

```ts
import type { LogFilter, LogItem, LogLevel } from './logTypes'

export function parseLogLine(line: string, id: number): LogItem {
  const raw = String(line || '')
  const ts = Date.now()
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') {
      const anyObj = obj as Record<string, unknown>
      const level = String(anyObj.level || 'info') as LogLevel
      const msg = String(anyObj.msg || anyObj.message || raw)
      const traceId = typeof anyObj.trace_id === 'string' ? anyObj.trace_id : undefined
      if (level === 'info' || level === 'warn' || level === 'error') {
        return { id, kind: 'json', raw, ts, level, msg, traceId }
      }
    }
  } catch {}
  return { id, kind: 'text', raw, ts }
}

export function filterLogs(items: LogItem[], filter: LogFilter): LogItem[] {
  const kw = filter.keyword.trim().toLowerCase()
  return items.filter((it) => {
    if (filter.level !== 'all' && it.kind === 'json' && it.level !== filter.level) return false
    if (filter.level !== 'all' && it.kind === 'text') return true
    if (!kw) return true
    const hay = it.kind === 'json' ? `${it.msg} ${it.raw}` : it.raw
    return hay.toLowerCase().includes(kw)
  })
}
```

- [ ] **Step 4: Run tests (should pass)**

```bash
cd /workspace/desktop
npm test
```

- [ ] **Step 5: Implement LogViewer（虚拟滚动 + 智能跟随）**

`desktop/electron/renderer/src/features/task/LogViewer.tsx`（要点：useVirtualizer、稳定 key 用 `id`、暂停跟随与新日志角标）：

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogFilter, LogItem } from './logTypes'
import { filterLogs } from './logUtils'

export type LogViewerProps = {
  items: LogItem[]
}

export function LogViewer(props: LogViewerProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const [filter, setFilter] = useState<LogFilter>({ level: 'all', keyword: '' })
  const [follow, setFollow] = useState(true)
  const [newCount, setNewCount] = useState(0)

  const filtered = useMemo(() => filterLogs(props.items, filter), [props.items, filter])

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    getItemKey: (index) => filtered[index]?.id ?? index,
    overscan: 20
  })

  useEffect(() => {
    if (!follow) {
      setNewCount((c) => c + 1)
      return
    }
    setNewCount(0)
    rowVirtualizer.scrollToIndex(filtered.length - 1, { align: 'end' })
  }, [filtered.length, follow])

  const onScroll = () => {
    const el = parentRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceToBottom < 20
    if (nearBottom) {
      setFollow(true)
      setNewCount(0)
    } else {
      setFollow(false)
    }
  }

  return (
    <div className="card">
      <div className="toolbar">
        <select
          className="input"
          value={filter.level}
          onChange={(e) => setFilter((p) => ({ ...p, level: e.target.value as LogFilter['level'] }))}
        >
          <option value="all">all</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <input
          className="input"
          placeholder="搜索（200ms debounce 由上层实现或后续加）"
          value={filter.keyword}
          onChange={(e) => setFilter((p) => ({ ...p, keyword: e.target.value }))}
        />
        {!follow && (
          <button
            type="button"
            className="badge"
            onClick={() => {
              setFollow(true)
              setNewCount(0)
              rowVirtualizer.scrollToIndex(filtered.length - 1, { align: 'end' })
            }}
          >
            新日志 {newCount}
          </button>
        )}
      </div>

      <div className="log-viewport" ref={parentRef} onScroll={onScroll}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((v) => {
            const item = filtered[v.index]
            const top = v.start
            return (
              <div
                key={v.key}
                className={item?.kind === 'json' ? `log-line log-${item.level}` : 'log-line'}
                style={{ position: 'absolute', top, left: 0, right: 0 }}
              >
                {renderLine(item)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function renderLine(it: LogItem | undefined) {
  if (!it) return null
  if (it.kind === 'text') return it.raw
  return it.msg
}
```

- [ ] **Step 6: Run tests + typecheck**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
cd /workspace
git add desktop/electron/renderer/src/features/task/logTypes.ts desktop/electron/renderer/src/features/task/logUtils.ts desktop/electron/renderer/src/features/task/logUtils.test.ts desktop/electron/renderer/src/features/task/LogViewer.tsx
git commit -m "feat(phase5): add virtualized log viewer"
```

---

## Task 5: TaskController（spawn/订阅/退出/自动跳转）+ 页面接线

**Files:**
- Create: `desktop/electron/renderer/src/features/task/TaskController.tsx`
- Create: `desktop/electron/renderer/src/pages/TasksPage.tsx`
- Modify: `desktop/electron/renderer/src/pages/ConsolePage.tsx`

- [ ] **Step 1: 实现 TaskController（useEffect 解绑）**

`desktop/electron/renderer/src/features/task/TaskController.tsx`：

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TaskConfig } from './configSchema'
import { parseLogLine } from './logUtils'
import type { LogItem } from './logTypes'
import { TaskConfigForm } from './TaskConfigForm'
import { LogViewer } from './LogViewer'

type Status = 'idle' | 'running' | 'exited' | 'error'

export function TaskController() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('idle')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [items, setItems] = useState<LogItem[]>([])
  const startedAtRef = useRef<number>(0)
  const lastCfgRef = useRef<TaskConfig | null>(null)

  const onSubmit = async (cfg: TaskConfig) => {
    const runId = cfg.runId
    lastCfgRef.current = cfg
    startedAtRef.current = Date.now()
    setActiveRunId(runId)
    setItems([])
    setStatus('running')

    const offLog = window.api.job.onLog(runId, (line) => {
      setItems((prev) => [...prev, parseLogLine(line, prev.length)])
    })
    const offStatus = window.api.job.onStatus(runId, (ev) => {
      if (ev.status === 'error') setStatus('error')
      if (ev.status === 'exited') {
        setStatus('exited')
        offLog()
        offStatus()
        if (cfg.advanced.autoJumpToReport) {
          setTimeout(() => navigate(`/report/${runId}`), 500)
        }
      }
    })

    const script = `scripts/${cfg.script}`
    const args = ['--scenario', cfg.scenario, '--trace-id', runId]
    const res = await window.api.job.start({ runId, script, args, env: cfg.env })
    if (!res.success) {
      offLog()
      offStatus()
      setStatus('error')
      setItems((prev) => [...prev, parseLogLine(`ERROR: ${res.error}`, prev.length)])
    }
  }

  const canCancel = status === 'running' && activeRunId

  const cancel = async () => {
    if (!activeRunId) return
    await window.api.job.cancel(activeRunId)
  }

  const durationMs = useMemo(() => {
    if (!startedAtRef.current) return 0
    if (status === 'running') return Date.now() - startedAtRef.current
    return Date.now() - startedAtRef.current
  }, [status])

  return (
    <div className="grid">
      <div>
        <TaskConfigForm onSubmit={onSubmit} defaultValues={lastCfgRef.current ?? undefined} />
        <div className="row" style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button type="button" className="btn" disabled={!canCancel} onClick={cancel}>
            取消
          </button>
          <div className="muted">状态: {status} 耗时: {Math.round(durationMs / 1000)}s</div>
        </div>
      </div>
      <div>
        <LogViewer items={items} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TasksPage 使用 TaskController**

`desktop/electron/renderer/src/pages/TasksPage.tsx`：

```tsx
import { TaskController } from '../features/task/TaskController'

export function TasksPage() {
  return (
    <div className="page">
      <h1 className="page-title">任务</h1>
      <p className="page-subtitle">配置 → 启动 → 日志 → 退出 → 报告联动</p>
      <div style={{ marginTop: 16 }}>
        <TaskController />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: ConsolePage（先显示占位：后续聚合当前 run）**

`desktop/electron/renderer/src/pages/ConsolePage.tsx`：

```tsx
export function ConsolePage() {
  return (
    <div className="page">
      <h1 className="page-title">控制台</h1>
      <p className="page-subtitle">Task 3 先完成任务页闭环；后续会聚合当前任务日志到此页。</p>
    </div>
  )
}
```

- [ ] **Step 4: typecheck + tests**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add desktop/electron/renderer/src/features/task/TaskController.tsx desktop/electron/renderer/src/pages/TasksPage.tsx desktop/electron/renderer/src/pages/ConsolePage.tsx
git commit -m "feat(phase5): add task controller workflow"
```

---

## Task 6: ReportPage（自动跳转落点 + 导出日志 + 关键事件摘要）

**Files:**
- Create: `desktop/electron/renderer/src/pages/ReportPage.tsx`

- [ ] **Step 1: 实现 ReportPage（读取 job 状态与导出）**

`desktop/electron/renderer/src/pages/ReportPage.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { JobStatusEvent } from '../preload/types'
import { parseLogLine } from '../features/task/logUtils'
import type { LogItem } from '../features/task/logTypes'

export function ReportPage() {
  const { runId } = useParams()
  const rid = runId || ''
  const [status, setStatus] = useState<JobStatusEvent | null>(null)
  const [logs, setLogs] = useState<LogItem[]>([])

  useEffect(() => {
    if (!rid) return
    const offLog = window.api.job.onLog(rid, (line) => setLogs((p) => [...p, parseLogLine(line, p.length)]))
    const offStatus = window.api.job.onStatus(rid, (ev) => setStatus(ev))
    return () => {
      offLog()
      offStatus()
    }
  }, [rid])

  const summary = useMemo(() => {
    return logs
      .filter((it) => it.kind === 'json' && (it.msg.includes('session') || it.msg.includes('result') || it.msg.includes('error')))
      .slice(-50)
  }, [logs])

  const exportLog = async () => {
    if (!rid) return
    await window.api.job.exportLog(rid)
  }

  return (
    <div className="page">
      <h1 className="page-title">报告</h1>
      <p className="page-subtitle">RunID: {rid}</p>

      <div className="card">
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn" onClick={exportLog}>
            导出完整日志
          </button>
          <div className="muted">状态: {status?.status || 'unknown'}</div>
          {'code' in (status || {}) && <div className="muted">exitCode: {(status as any).code}</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <div className="label">关键事件摘要</div>
        </div>
        <pre className="console">{summary.map((it) => (it.kind === 'json' ? it.msg : it.raw)).join('\n')}</pre>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: typecheck + tests**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /workspace
git add desktop/electron/renderer/src/pages/ReportPage.tsx
git commit -m "feat(phase5): add report page with export log"
```

---

## Task 7: KnowledgeList（mock + 搜索 + 点击回填）

**Files:**
- Create: `desktop/electron/renderer/src/features/kb/mockKnowledge.ts`
- Create: `desktop/electron/renderer/src/features/kb/KnowledgeList.tsx`
- Create: `desktop/electron/renderer/src/pages/KnowledgeBasePage.tsx`

- [ ] **Step 1: 实现 mock 数据**

`desktop/electron/renderer/src/features/kb/mockKnowledge.ts`：

```ts
export type KnowledgeItem = {
  id: string
  title: string
  tags: string[]
  lastUsed: number
  relatedRuns: string[]
  preset: { script: 'mock_device.py' | 'firmware_build.py' | 'e2e_test.py'; scenario: string }
}

export const mockKnowledge: KnowledgeItem[] = [
  {
    id: 'kb-001',
    title: '设备正常启动链路',
    tags: ['device', 'smoke'],
    lastUsed: Date.now() - 86400_000,
    relatedRuns: [],
    preset: { script: 'mock_device.py', scenario: 'normal' }
  },
  {
    id: 'kb-002',
    title: '异常恢复用例',
    tags: ['device', 'error'],
    lastUsed: Date.now() - 3600_000,
    relatedRuns: [],
    preset: { script: 'mock_device.py', scenario: 'spam' }
  }
]
```

- [ ] **Step 2: 实现 KnowledgeList（搜索 + 点击回填回调）**

`desktop/electron/renderer/src/features/kb/KnowledgeList.tsx`：

```tsx
import { useMemo, useState } from 'react'
import { mockKnowledge, type KnowledgeItem } from './mockKnowledge'

export type KnowledgeListProps = {
  onPickPreset: (preset: KnowledgeItem['preset']) => void
}

export function KnowledgeList(props: KnowledgeListProps) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return mockKnowledge
    return mockKnowledge.filter((it) => {
      const hay = `${it.title} ${it.tags.join(' ')}`.toLowerCase()
      return hay.includes(kw)
    })
  }, [q])

  return (
    <div className="card">
      <div className="row">
        <input className="input" placeholder="搜索（标题/标签）" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="list">
        {list.map((it) => (
          <button key={it.id} type="button" className="list-item" onClick={() => props.onPickPreset(it.preset)}>
            <div className="list-title">{it.title}</div>
            <div className="list-subtitle">{it.tags.join(', ')}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: KnowledgeBasePage（接线到 tasks：先简单提示，后续做跨页共享状态）**

`desktop/electron/renderer/src/pages/KnowledgeBasePage.tsx`：

```tsx
import { useNavigate } from 'react-router-dom'
import { KnowledgeList } from '../features/kb/KnowledgeList'

export function KnowledgeBasePage() {
  const navigate = useNavigate()
  return (
    <div className="page">
      <h1 className="page-title">知识库</h1>
      <p className="page-subtitle">点击条目跳转到任务页并在下个版本回填配置（Task 3 先做导航闭环）。</p>
      <div style={{ marginTop: 16 }}>
        <KnowledgeList
          onPickPreset={() => {
            navigate('/tasks')
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: typecheck**

```bash
cd /workspace/desktop
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add desktop/electron/renderer/src/features/kb desktop/electron/renderer/src/pages/KnowledgeBasePage.tsx
git commit -m "feat(phase5): add knowledge base list mock"
```

---

## Task 8: 样式补齐（表单/卡片/列表/console）+ 最终门禁

**Files:**
- Modify: `desktop/electron/renderer/src/styles.css`
- Modify: `desktop/electron/renderer/src/pages/ReportsPage.tsx`
- Modify: `desktop/electron/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: 更新 styles.css（卡片/输入/列表/viewport）**

在 `styles.css` 追加（保持简洁一致）：

```css
.card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 12px;
}

.row {
  margin-top: 10px;
}

.label {
  font-size: 12px;
  opacity: 0.75;
  margin-bottom: 6px;
}

.input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  border-radius: 10px;
  padding: 8px 10px;
  outline: none;
}

.error {
  margin-top: 6px;
  color: #ff9a9a;
  font-size: 12px;
}

.muted {
  opacity: 0.7;
  font-size: 12px;
}

.grid {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 14px;
}

.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

.badge {
  border: 1px solid rgba(131, 170, 255, 0.35);
  background: rgba(131, 170, 255, 0.12);
  color: inherit;
  border-radius: 999px;
  padding: 6px 10px;
  cursor: pointer;
}

.log-viewport {
  margin-top: 10px;
  height: 420px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
}

.log-line {
  padding: 2px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}

.log-info {
  color: rgba(232, 238, 252, 0.92);
}

.log-warn {
  color: #ffd480;
}

.log-error {
  color: #ff9a9a;
}

.list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.list-item {
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
  color: inherit;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
}

.list-title {
  font-weight: 600;
}

.list-subtitle {
  opacity: 0.7;
  font-size: 12px;
  margin-top: 4px;
}
```

- [ ] **Step 2: ReportsPage/SettingsPage 占位更新**

ReportsPage：提示 run 列表将读取 `results/runs`（Task 4 做）  
SettingsPage：提示 Python/Playwright 安装入口（Task 4/5 做）

- [ ] **Step 3: 门禁**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /workspace
git add desktop/electron/renderer/src/styles.css desktop/electron/renderer/src/pages/ReportsPage.tsx desktop/electron/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(phase5): polish task3 ui styles"
```

---

## 最终验收（本地）

```bash
cd /workspace/desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund
npm test
npm run typecheck
npm run dev
```

手动验收路径：
- 任务页：填写配置 → 开始任务 → 日志滚动 → 退出 → 自动跳转 `/report/<runId>`
- 报告页：导出日志触发系统保存对话框（主进程处理）

