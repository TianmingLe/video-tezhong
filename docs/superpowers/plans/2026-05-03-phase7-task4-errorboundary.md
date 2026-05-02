# Phase 7 Task 4 (Global ErrorBoundary) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `main.tsx` 顶层建立全站 ErrorBoundary（覆盖 `/onboarding`），并用 `Suspense + InlineSkeleton` 承接路由模块懒加载；提供错误页（全 Inline Styles）与“复制错误信息（含 appVersion/platform/errorSummary）+ 返回任务页 + 重新加载”。

**Architecture:** `main.tsx` 采用 `<ErrorBoundary><Suspense fallback={<InlineSkeleton/>}><AppRouter/></Suspense></ErrorBoundary>`，其中 `AppRouter` 通过 `React.lazy` 动态导入。核心可测试逻辑抽到 `formatErrorReport`（格式化与截断）与 `copyToClipboard`（剪贴板策略与 fallback），vitest 单测集中覆盖这两者；ErrorBoundary 本体保持最小状态机与类型检查。

**Tech Stack:** TypeScript + React 18 + vitest

---

## 0. File Map

**Create**
- `desktop/electron/renderer/src/components/error/ErrorBoundary.tsx`
- `desktop/electron/renderer/src/components/error/InlineSkeleton.tsx`
- `desktop/electron/renderer/src/components/error/formatErrorReport.ts`
- `desktop/electron/renderer/src/components/error/formatErrorReport.test.ts`
- `desktop/electron/renderer/src/components/error/copyToClipboard.ts`
- `desktop/electron/renderer/src/components/error/copyToClipboard.test.ts`

**Modify**
- `desktop/electron/renderer/src/main.tsx`

---

## Task 4.1: formatErrorReport（TDD，纯函数）

**Files:**
- Create: `desktop/electron/renderer/src/components/error/formatErrorReport.ts`
- Test: `desktop/electron/renderer/src/components/error/formatErrorReport.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from 'vitest'
import { formatErrorReport } from './formatErrorReport'

describe('formatErrorReport', () => {
  test('fills unknown fields when missing', () => {
    const out = formatErrorReport({ error: new Error('boom') })
    expect(out).toContain('appVersion: unknown')
    expect(out).toContain('platform: unknown')
    expect(out).toContain('href: unknown')
  })

  test('supports string error', () => {
    const out = formatErrorReport({ error: 'bad' })
    expect(out).toContain('errorMessage: bad')
  })

  test('truncates long stacks', () => {
    const e = new Error('x')
    ;(e as Error).stack = 'S'.repeat(5000)
    const out = formatErrorReport({ error: e, maxStackChars: 120 })
    expect(out.length).toBeLessThan(800)
    expect(out).toContain('(truncated)')
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `cd /workspace/desktop && npm test desktop/electron/renderer/src/components/error/formatErrorReport.test.ts`  
Expected: FAIL（module not found）

- [ ] **Step 3: Implement minimal formatter**

```ts
export function formatErrorReport(input: {
  appVersion?: string | null
  platform?: string | null
  href?: string | null
  error: unknown
  componentStack?: string | null
  maxStackChars?: number
}): string {
  const appVersion = (input.appVersion ?? '').trim() || 'unknown'
  const platform = (input.platform ?? '').trim() || 'unknown'
  const href = (input.href ?? '').trim() || 'unknown'
  const max = typeof input.maxStackChars === 'number' && Number.isFinite(input.maxStackChars) ? Math.max(200, Math.floor(input.maxStackChars)) : 4000

  const asError = input.error instanceof Error ? input.error : null
  const errorMessage =
    typeof input.error === 'string' ? input.error : asError ? asError.message : input.error ? JSON.stringify(input.error) : 'unknown'
  const rawStack = asError?.stack ? String(asError.stack) : ''
  const stack = rawStack.length > max ? rawStack.slice(0, max) + '\\n…(truncated)' : rawStack
  const componentStack = (input.componentStack ?? '').trim()

  const lines: string[] = []
  lines.push(`appVersion: ${appVersion}`)
  lines.push(`platform: ${platform}`)
  lines.push(`href: ${href}`)
  lines.push(`errorMessage: ${errorMessage}`)
  if (stack) lines.push(`stack:\\n${stack}`)
  if (componentStack) lines.push(`componentStack:\\n${componentStack}`)
  return lines.join('\\n')
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `cd /workspace/desktop && npm test desktop/electron/renderer/src/components/error/formatErrorReport.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/renderer/src/components/error/formatErrorReport.*
git commit -m "feat(renderer): add formatErrorReport for error boundary"
```

---

## Task 4.2: copyToClipboard（TDD，fallback 策略）

**Files:**
- Create: `desktop/electron/renderer/src/components/error/copyToClipboard.ts`
- Test: `desktop/electron/renderer/src/components/error/copyToClipboard.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test, vi } from 'vitest'
import { copyToClipboard } from './copyToClipboard'

describe('copyToClipboard', () => {
  test('uses clipboardWriteText when available', async () => {
    const clipboardWriteText = vi.fn(async () => {})
    const res = await copyToClipboard({ text: 'x', clipboardWriteText, execCommandCopy: () => false })
    expect(res.success).toBe(true)
    expect(clipboardWriteText).toHaveBeenCalledWith('x')
  })

  test('falls back to execCommandCopy when clipboard throws', async () => {
    const clipboardWriteText = vi.fn(async () => {
      throw new Error('denied')
    })
    const execCommandCopy = vi.fn(() => true)
    const res = await copyToClipboard({ text: 'x', clipboardWriteText, execCommandCopy })
    expect(res.success).toBe(true)
    expect(execCommandCopy).toHaveBeenCalled()
  })

  test('returns error when all strategies fail', async () => {
    const clipboardWriteText = vi.fn(async () => {
      throw new Error('denied')
    })
    const execCommandCopy = vi.fn(() => false)
    const res = await copyToClipboard({ text: 'x', clipboardWriteText, execCommandCopy })
    expect(res.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `cd /workspace/desktop && npm test desktop/electron/renderer/src/components/error/copyToClipboard.test.ts`  
Expected: FAIL（module not found）

- [ ] **Step 3: Implement minimal copyToClipboard**

```ts
export async function copyToClipboard(args: {
  text: string
  clipboardWriteText?: (text: string) => Promise<void>
  execCommandCopy?: (text: string) => boolean
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (args.clipboardWriteText) {
      await args.clipboardWriteText(args.text)
      return { success: true }
    }
  } catch (e) {
    try {
      if (args.execCommandCopy && args.execCommandCopy(args.text)) return { success: true }
      return { success: false, error: String((e as Error)?.message || e) }
    } catch (e2) {
      return { success: false, error: String((e2 as Error)?.message || e2) }
    }
  }
  try {
    if (args.execCommandCopy && args.execCommandCopy(args.text)) return { success: true }
    return { success: false, error: 'copy failed' }
  } catch (e) {
    return { success: false, error: String((e as Error)?.message || e) }
  }
}
```

- [ ] **Step 4: Run tests to verify GREEN**
- [ ] **Step 5: Commit**

```bash
git add desktop/electron/renderer/src/components/error/copyToClipboard.*
git commit -m "feat(renderer): add copyToClipboard with fallback"
```

---

## Task 4.3: InlineSkeleton + ErrorBoundary 组件（Inline Styles）

**Files:**
- Create: `desktop/electron/renderer/src/components/error/InlineSkeleton.tsx`
- Create: `desktop/electron/renderer/src/components/error/ErrorBoundary.tsx`

- [ ] **Step 1: Implement InlineSkeleton (no CSS classes)**

```tsx
export function InlineSkeleton() {
  const bar = (w: string, h: number) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 8,
        background: 'rgba(255,255,255,0.08)'
      }}
    />
  )

  return (
    <div style={{ padding: 28, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      {bar('220px', 18)}
      <div style={{ height: 12 }} />
      {bar('60%', 14)}
      <div style={{ height: 10 }} />
      {bar('80%', 14)}
    </div>
  )
}
```

- [ ] **Step 2: Implement ErrorBoundary (minimal state machine)**

Key requirements:
- no CSS classes
- buttons: copy / go tasks / reload
- copy includes appVersion/platform/errorSummary by `formatErrorReport`
- copy uses `copyToClipboard` with injected strategies:
  - `clipboardWriteText: navigator.clipboard?.writeText?.bind(navigator.clipboard)`
  - `execCommandCopy`: function that creates textarea + execCommand('copy')

- [ ] **Step 3: Typecheck**

Run: `cd /workspace/desktop && npm run typecheck`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/renderer/src/components/error/*
git commit -m "feat(renderer): add global ErrorBoundary ui"
```

---

## Task 4.4: main.tsx 顶层挂载（强制结构）

**Files:**
- Modify: `desktop/electron/renderer/src/main.tsx`

- [ ] **Step 1: Change main.tsx to required structure**

```tsx
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './components/error/ErrorBoundary'
import { InlineSkeleton } from './components/error/InlineSkeleton'

const AppRouter = React.lazy(() => import('./app/router').then((m) => ({ default: m.AppRouter })))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<InlineSkeleton />}>
        <AppRouter />
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
)
```

Note: 保留现有全局 styles.css import（允许），但错误页/骨架屏自身不得依赖 className。

- [ ] **Step 2: Run gate**

Run: `cd /workspace/desktop && npm test`  
Expected: PASS  
Run: `cd /workspace/desktop && npm run typecheck`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add desktop/electron/renderer/src/main.tsx
git commit -m "feat(renderer): mount global error boundary at entry"
```

---

## Task 4 Gate

- [ ] `cd /workspace/desktop && npm test`
- [ ] `cd /workspace/desktop && npm run typecheck`

