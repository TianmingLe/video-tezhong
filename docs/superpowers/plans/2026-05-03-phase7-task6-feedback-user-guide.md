# Phase 7 Task 6 (Feedback + USER_GUIDE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Settings 提供“反馈问题”入口，生成并复制 GitHub Issue 模板 Markdown（含系统信息/崩溃摘要/最近任务/用户描述），并新增 `docs/USER_GUIDE.md` 用户手册。

**Architecture:** main 侧新增 `createFeedbackBundleCollector`（依赖注入 fs/path + tasksRepo + versions/appVersion），通过 IPC 暴露 `feedback:collectBundle` 返回 `{ markdown }`。renderer 侧 Settings 增加面板与 textarea，点击后调用 IPC 获取文本并执行剪贴板复制（优先 clipboard API，fallback execCommand）。测试集中在 main 侧 bundle 生成与 renderer 侧 copy helper 的 fallback，不引入重型测试库。

**Tech Stack:** TypeScript + Electron IPC + vitest

---

## 0. File Map

**Create**
- `desktop/electron/main/feedback/collectFeedbackBundle.ts`
- `desktop/electron/main/feedback/collectFeedbackBundle.test.ts`
- `desktop/electron/main/feedback/index.ts`
- `desktop/electron/renderer/src/features/feedback/copyText.ts`
- `desktop/electron/renderer/src/features/feedback/copyText.test.ts`
- `docs/USER_GUIDE.md`

**Modify**
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/shared/ipc.test.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`

---

## Task 6.1: main — collectFeedbackBundle（TDD）

**Files:**
- Create: `desktop/electron/main/feedback/collectFeedbackBundle.ts`
- Test: `desktop/electron/main/feedback/collectFeedbackBundle.test.ts`
- Create: `desktop/electron/main/feedback/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from 'vitest'
import { createFeedbackBundleCollector } from './collectFeedbackBundle'

function fakeFs(args: { crashFiles?: Array<{ name: string; mtimeMs: number; json: string }> }) {
  const files = args.crashFiles ?? []
  const byName = new Map(files.map((f) => [f.name, f]))
  return {
    existsSync: (p: string) => p.endsWith('/crash') ? true : true,
    readdirSync: (_p: string) => files.map((f) => f.name),
    statSync: (p: string) => ({ mtimeMs: byName.get(p.split('/').pop()!)?.mtimeMs ?? 0 } as never),
    readFileSync: (p: string) => byName.get(p.split('/').pop()!)?.json ?? ''
  }
}

describe('collectFeedbackBundle', () => {
  test('includes system info table and user input', async () => {
    const fs = fakeFs({ crashFiles: [] })
    const tasksRepo = { getAll: () => [] }
    const c = createFeedbackBundleCollector({
      userDataPath: '/u',
      fs: fs as never,
      path: { join: (...ps: string[]) => ps.join('/') } as never,
      tasksRepo: tasksRepo as never,
      versions: { platform: 'linux', arch: 'x64', appVersion: '0.0.1', nodeVersion: 'v1', electronVersion: '31' }
    })
    const md = await c.collect({ userDescription: 'hello' })
    expect(md).toContain('## User Input')
    expect(md).toContain('hello')
    expect(md).toContain('| platform |')
    expect(md).toContain('| linux |')
  })

  test('reads latest crash files and truncates stack', async () => {
    const longStack = 'S'.repeat(9000)
    const fs = fakeFs({
      crashFiles: [
        { name: 'a.json', mtimeMs: 1, json: JSON.stringify({ error: { message: 'm1', stack: longStack } }) },
        { name: 'b.json', mtimeMs: 2, json: JSON.stringify({ error: { message: 'm2', stack: longStack } }) },
        { name: 'c.json', mtimeMs: 3, json: JSON.stringify({ error: { message: 'm3', stack: longStack } }) }
      ]
    })
    const tasksRepo = { getAll: () => [] }
    const c = createFeedbackBundleCollector({
      userDataPath: '/u',
      fs: fs as never,
      path: { join: (...ps: string[]) => ps.join('/') } as never,
      tasksRepo: tasksRepo as never,
      versions: { platform: 'linux', arch: 'x64', appVersion: '0.0.1', nodeVersion: 'v1', electronVersion: '31' }
    })
    const md = await c.collect({ userDescription: 'x' })
    expect(md).toContain('m3')
    expect(md).toContain('m2')
    expect(md).not.toContain('m1')
    expect(md).toContain('(truncated)')
  })
})
```

- [ ] **Step 2: Run to verify RED**

Run: `cd /workspace/desktop && npm test desktop/electron/main/feedback/collectFeedbackBundle.test.ts`  
Expected: FAIL（module not found）

- [ ] **Step 3: Implement createFeedbackBundleCollector**

Implementation requirements:
- inject deps: `fs/path/tasksRepo/versions/userDataPath`
- read crash dir `<userDataPath>/crash`
- pick latest 2 `.json` by `mtimeMs desc`
- stack truncation: max 2000 chars + `…(truncated)`
- last task: `tasksRepo.getAll()[0] ?? null`
- output markdown with system info table + crash details + last task + user input

- [ ] **Step 4: Re-run tests to verify GREEN**
- [ ] **Step 5: Export from index.ts**

```ts
export * from './collectFeedbackBundle'
```

- [ ] **Step 6: Commit**

```bash
git add desktop/electron/main/feedback
git commit -m "feat(feedback): add main bundle collector"
```

---

## Task 6.2: IPC + preload wiring

**Files:**
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/shared/ipc.test.ts`
- Modify: `desktop/electron/main/index.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`

- [ ] **Step 1: Add ipc channel**

In `ipc.ts`:

```ts
feedbackCollectBundle: 'feedback:collectBundle'
```

- [ ] **Step 2: Update ipc.test.ts**
  - assert new key exists in `ipcChannels`

- [ ] **Step 3: Wire ipcMain.handle**
  - create collector inside `app.whenReady` block using real deps:
    - `versions`: `platform/arch/app.getVersion()/process.version/process.versions.electron`
    - `tasksRepo` reuse existing instance
  - handler signature:

```ts
ipcMain.handle(ipcChannels.feedbackCollectBundle, async (_evt, input: unknown) => {
  const o = (input && typeof input === 'object' ? (input as Record<string, unknown>) : null) ?? {}
  const userDescription = String(o.userDescription ?? '')
  const markdown = await feedback.collect({ userDescription })
  return { markdown }
})
```

- [ ] **Step 4: Preload types**

In `DesktopApi` add:

```ts
feedback: { collectBundle: (args: { userDescription: string }) => Promise<{ markdown: string }> }
```

- [ ] **Step 5: Preload impl**

Expose in `window.api.feedback.collectBundle = (args) => ipcRenderer.invoke(ipcChannels.feedbackCollectBundle, args)`

- [ ] **Step 6: Commit**

```bash
git add desktop/electron/shared/ipc.ts desktop/electron/shared/ipc.test.ts desktop/electron/main/index.ts desktop/electron/preload/types.ts desktop/electron/preload/index.ts
git commit -m "feat(feedback): wire ipc and preload api"
```

---

## Task 6.3: renderer — Settings 反馈入口 + 剪贴板降级（TDD）

**Files:**
- Create: `desktop/electron/renderer/src/features/feedback/copyText.ts`
- Test: `desktop/electron/renderer/src/features/feedback/copyText.test.ts`
- Modify: `desktop/electron/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write failing tests for copyText**

```ts
import { describe, expect, test, vi } from 'vitest'
import { copyText } from './copyText'

describe('copyText', () => {
  test('prefers clipboard writeText', async () => {
    const writeText = vi.fn(async () => {})
    const res = await copyText({ text: 'x', writeText, execCommandCopy: () => false })
    expect(res.success).toBe(true)
    expect(writeText).toHaveBeenCalledWith('x')
  })

  test('falls back to execCommandCopy', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied')
    })
    const res = await copyText({ text: 'x', writeText, execCommandCopy: () => true })
    expect(res.success).toBe(true)
  })
})
```

- [ ] **Step 2: Implement copyText**

```ts
export async function copyText(args: {
  text: string
  writeText?: (text: string) => Promise<void>
  execCommandCopy?: (text: string) => boolean
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    if (args.writeText) {
      await args.writeText(args.text)
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

- [ ] **Step 3: Update SettingsPage UI**
  - 增加 state：`feedbackOpen`, `feedbackText`, `generating`
  - 面板（`.card`）包含 textarea、按钮“生成并复制”“取消”
  - 点击“生成并复制”：
    - 调用 `window.api.feedback.collectBundle({ userDescription: feedbackText })`
    - 调用 `copyText` 写剪贴板：
      - `writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard)`
      - `execCommandCopy` 使用隐藏 textarea + `document.execCommand('copy')`
    - toast 提示成功/失败

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/renderer/src/features/feedback desktop/electron/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(feedback): add settings entry and clipboard copy"
```

---

## Task 6.4: 文档 USER_GUIDE

**Files:**
- Create: `docs/USER_GUIDE.md`

- [ ] **Step 1: Write USER_GUIDE.md**
  - 安装与更新
  - 核心功能
  - FAQ（Python 检测失败/日志导出/任务卡顿）
  - 反馈指南（包含 issue 链接）

- [ ] **Step 2: Commit**

```bash
git add docs/USER_GUIDE.md
git commit -m "docs: add user guide"
```

---

## Task 6 Gate

- [ ] `cd /workspace/desktop && npm test`
- [ ] `cd /workspace/desktop && npm run typecheck`

