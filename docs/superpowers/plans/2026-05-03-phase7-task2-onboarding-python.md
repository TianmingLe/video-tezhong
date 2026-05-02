# Phase 7 Task 2 (Onboarding + Python Check) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/onboarding` 独立路由的首次启动引导，状态存于 `<userData>/onboarding.json`；提供跨平台 Python 环境检测 `system:checkPython`；通过路由守卫拦截未完成引导的用户；Settings 支持重置引导。全部离线可用，TDD 与 100% TypeScript。

**Architecture:** 主进程提供 OnboardingStore(JSON) + checkPython(exec) + IPC；preload 暴露强类型 `api.onboarding/api.system`；renderer 增加 OnboardingPage(3 步) + AppShell 守卫 controller；所有核心逻辑先写失败测试。

**Tech Stack:** TypeScript + Electron + vitest + react-router-dom

---

## 0. Files

**Create**
- `desktop/electron/main/onboarding/onboardingStore.ts`
- `desktop/electron/main/onboarding/onboardingStore.test.ts`
- `desktop/electron/main/system/checkPython.ts`
- `desktop/electron/main/system/checkPython.test.ts`
- `desktop/electron/renderer/src/pages/OnboardingPage.tsx`
- `desktop/electron/renderer/src/features/onboarding/onboardingGuard.ts`
- `desktop/electron/renderer/src/features/onboarding/onboardingGuard.test.ts`

**Modify**
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/renderer/src/app/router.tsx`
- `desktop/electron/renderer/src/app/layout/AppShell.tsx`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`

---

## Task 2.1: 主进程 OnboardingStore（RED → GREEN）

- [ ] **Step 1: Write failing test for onboardingStore read default**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test, beforeEach } from 'vitest'
import { createOnboardingStore } from './onboardingStore'

describe('onboardingStore', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-onboarding-'))
  })

  test('read: returns default when file missing', () => {
    const store = createOnboardingStore({ userDataPath: dir, fs })
    expect(store.read()).toEqual({ version: 1, completed: false })
  })
})
```

- [ ] **Step 2: Run**

Run: `cd /workspace/desktop && npm test desktop/electron/main/onboarding/onboardingStore.test.ts`  
Expected: FAIL（module not found / createOnboardingStore missing）

- [ ] **Step 3: Implement minimal onboardingStore**

```ts
export type OnboardingState = { version: 1; completed: boolean; skippedAt?: number }

export function createOnboardingStore(deps: { userDataPath: string; fs: typeof import('node:fs') }) {
  const filePath = deps.fs.existsSync(deps.userDataPath) ? `${deps.userDataPath}/onboarding.json` : `${deps.userDataPath}/onboarding.json`
  const defaultState: OnboardingState = { version: 1, completed: false }

  const parse = (raw: string): OnboardingState => {
    try {
      const v = JSON.parse(raw) as unknown
      if (!v || typeof v !== 'object') return defaultState
      const o = v as Record<string, unknown>
      if (o.version !== 1) return defaultState
      if (typeof o.completed !== 'boolean') return defaultState
      const skippedAt = typeof o.skippedAt === 'number' && Number.isFinite(o.skippedAt) ? o.skippedAt : undefined
      return { version: 1, completed: o.completed, skippedAt }
    } catch {
      return defaultState
    }
  }

  const ensureDir = () => deps.fs.mkdirSync(deps.userDataPath, { recursive: true })

  const read = (): OnboardingState => {
    try {
      if (!deps.fs.existsSync(filePath)) return defaultState
      return parse(deps.fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return defaultState
    }
  }

  const write = (next: OnboardingState): void => {
    ensureDir()
    deps.fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8')
  }

  const markCompleted = (): OnboardingState => {
    const next: OnboardingState = { version: 1, completed: true }
    write(next)
    return next
  }

  const reset = (): OnboardingState => {
    const next: OnboardingState = { version: 1, completed: false }
    write(next)
    return next
  }

  return { read, write, markCompleted, reset }
}
```

- [ ] **Step 4: Add tests for write/reset + corrupted fallback**
- [ ] **Step 5: Run all tests**

Run: `cd /workspace/desktop && npm test`  
Expected: PASS

- [ ] **Step 6: Commit**

`git commit -m "feat(onboarding): add onboardingStore json persistence"`

---

## Task 2.2: 主进程 checkPython（RED → GREEN）

- [ ] **Step 1: Write failing tests for command selection + version parsing**

```ts
import { describe, expect, test, vi } from 'vitest'

vi.mock('node:child_process', () => {
  return {
    exec: vi.fn()
  }
})

describe('checkPython', () => {
  test('uses python on win32 first', async () => {
    const { exec } = await import('node:child_process')
    ;(exec as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce((cmd, cb) => {
      cb(null, 'Python 3.11.9', '')
      return {} as never
    })
    const { checkPython } = await import('./checkPython')
    const res = await checkPython({ platform: 'win32' })
    expect(String((exec as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain('python')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.version).toBe('3.11.9')
  })
})
```

- [ ] **Step 2: Run and verify RED**
- [ ] **Step 3: Implement checkPython with exec promisify + fallback commands**
- [ ] **Step 4: Add tests for “not installed” and “permission denied”**
- [ ] **Step 5: Commit**

`git commit -m "feat(system): add checkPython ipc helper"`

---

## Task 2.3: IPC + preload types（RED → GREEN）

- [ ] **Step 1: Add ipcChannels keys and update ipc.test.ts snapshot**
- [ ] **Step 2: Update preload/types.ts DesktopApi**
- [ ] **Step 3: Update preload/index.ts to expose api.onboarding/api.system**
- [ ] **Step 4: Register handlers in main/index.ts**
  - `onboarding:get` → store.read()
  - `onboarding:complete` → store.markCompleted()
  - `onboarding:reset` → store.reset()
  - `system:checkPython` → checkPython({ platform: process.platform })
- [ ] **Step 5: Run tests/typecheck**
- [ ] **Step 6: Commit**

`git commit -m "feat(ipc): add onboarding + system checkPython channels"`

---

## Task 2.4: Renderer 路由 + 守卫（/onboarding 独立路由）（RED → GREEN）

- [ ] **Step 1: Write failing unit test for onboarding guard controller**

```ts
import { describe, expect, test, vi } from 'vitest'
import { createOnboardingGuardController } from './onboardingGuard'

describe('onboardingGuard', () => {
  test('redirects to /onboarding with replace when not completed', async () => {
    const navigate = vi.fn()
    const ctrl = createOnboardingGuardController({
      getState: async () => ({ version: 1, completed: false }),
      navigate
    })
    await ctrl.run()
    expect(navigate).toHaveBeenCalledWith('/onboarding', { replace: true })
  })
})
```

- [ ] **Step 2: Implement onboardingGuard controller**
- [ ] **Step 3: Wire guard in AppShellBody useEffect**
- [ ] **Step 4: Add /onboarding top-level route in app/router.tsx**
- [ ] **Step 5: Commit**

`git commit -m "feat(renderer): add onboarding route guard"`

---

## Task 2.5: OnboardingPage（3 steps + Python 检测 + 完成始终可点）

- [ ] **Step 1: Implement OnboardingPage skeleton**
  - step state：1/2/3
  - mount 时调用 `window.api.onboarding.getState()`；completed=true 则 `navigate('/tasks', { replace: true })`
- [ ] **Step 2: Step 2 Python 检测**
  - `loading=true` 时显示 Skeleton
  - 调用 `window.api.system.checkPython()`，渲染 ok/error/suggestion
  - “重新检测”按钮触发重跑
- [ ] **Step 3: Step 3 完成**
  - “进入应用”始终可点击：调用 `window.api.onboarding.complete()`；再 `navigate('/tasks', { replace: true })`
- [ ] **Step 4: Settings 增加“重新开始引导”**
  - `await window.api.onboarding.reset()`；再 `navigate('/onboarding', { replace: true })`
- [ ] **Step 5: Commit**

`git commit -m "feat(onboarding): add onboarding page and settings reset"`

---

## Task 2.6: Gate

- [ ] Run: `cd /workspace/desktop && npm test`
- [ ] Run: `cd /workspace/desktop && npm run typecheck`

