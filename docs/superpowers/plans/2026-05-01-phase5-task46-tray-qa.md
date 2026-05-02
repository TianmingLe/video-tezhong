# Phase 5 Task 4-6 (Tray QA + Docs + CI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供托盘闭环的 CI 可测集成验证（Mock 注入）、本地 `make verify-tray`、文档与 Linux CI 门禁。

**Architecture:** 将通知链路抽为 `notifyFlow`（依赖注入 Notification/Window/Navigate），用 vitest 以 mock 方式做“触发→通知→点击→导航”链路断言；本地脚本只运行该集成测试并输出结构化日志；CI Linux 复用本地脚本。

**Tech Stack:** TypeScript + vitest + GitHub Actions + Makefile + bash

---

## 0. File Map

**Create**
- `desktop/electron/main/notify/notifyFlow.ts`
- `desktop/electron/main/notify/notifyFlow.test.ts`
- `desktop/scripts/verify-tray-flow.sh`
- `docs/TRAY_GUIDE.md`
- `Makefile`
- `.github/workflows/ci.yml`

**Modify**
- `desktop/electron/main/index.ts`

---

## Task 1: notifyFlow（TDD）+ main/index.ts 重构接线

**Files**
- Create: `desktop/electron/main/notify/notifyFlow.test.ts`
- Create: `desktop/electron/main/notify/notifyFlow.ts`
- Modify: `desktop/electron/main/index.ts`

- [ ] **Step 1: Write failing test（链路：触发→通知→点击→导航）**

`desktop/electron/main/notify/notifyFlow.test.ts`：

```ts
import { describe, expect, test, vi } from 'vitest'
import { runNotifyFlow } from './notifyFlow'

test('runNotifyFlow: click navigates to report and focuses window', () => {
  const showAndFocusWindow = vi.fn()
  const sendNavigate = vi.fn()
  let onClick: (() => void) | null = null
  const createNotification = vi.fn(() => ({
    onClick: (cb: () => void) => {
      onClick = cb
    },
    show: vi.fn()
  }))

  runNotifyFlow({
    runId: 'test-123',
    exitCode: 0,
    platform: 'win32',
    deps: { createNotification, showAndFocusWindow, sendNavigate }
  })

  expect(createNotification).toHaveBeenCalledOnce()
  expect(typeof onClick).toBe('function')
  onClick?.()
  expect(showAndFocusWindow).toHaveBeenCalledOnce()
  expect(sendNavigate).toHaveBeenCalledWith('/report/test-123')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspace/desktop
npm test
```

Expected: FAIL（`runNotifyFlow` 不存在）

- [ ] **Step 3: Minimal implementation**

`desktop/electron/main/notify/notifyFlow.ts`：

```ts
import type { NotificationConstructorOptions } from 'electron'
import { buildNotificationPayload } from '../tray/notification'

export type NotifyDeps = {
  createNotification: (payload: NotificationConstructorOptions) => { onClick: (cb: () => void) => void; show: () => void }
  showAndFocusWindow: () => void
  sendNavigate: (path: string) => void
}

export function runNotifyFlow(args: {
  runId: string
  exitCode: number | null
  platform: NodeJS.Platform
  deps: NotifyDeps
}) {
  const payload = buildNotificationPayload({ runId: args.runId, exitCode: args.exitCode, platform: args.platform })
  const n = args.deps.createNotification(payload)
  n.onClick(() => {
    args.deps.showAndFocusWindow()
    args.deps.sendNavigate(`/report/${args.runId}`)
  })
  n.show()
}
```

- [ ] **Step 4: Update main/index.ts to use notifyFlow**

将 `processManager.onExit/onError` 内部的 Notification 创建逻辑替换为 `runNotifyFlow(...)`，注入真实依赖：

- `createNotification`: `payload => { const n = new Notification(payload); return { onClick: cb => n.on('click', cb), show: () => n.show() } }`
- `showAndFocusWindow`: `windowController.show(); windowController.getWindow()?.focus()`
- `sendNavigate`: `windowController.getWindow()?.webContents.send('app:navigate', { path })`

- [ ] **Step 5: Run tests + typecheck**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
cd /workspace
git add desktop/electron/main/notify/notifyFlow.ts desktop/electron/main/notify/notifyFlow.test.ts desktop/electron/main/index.ts
git commit -m "test(phase5): add notify flow integration test"
```

---

## Task 2: 本地验证脚本 + Makefile

**Files**
- Create: `desktop/scripts/verify-tray-flow.sh`
- Create: `Makefile`

- [ ] **Step 1: Add verify script**

`desktop/scripts/verify-tray-flow.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "[verify-tray] start"
cd "$(dirname "$0")/.."

export ELECTRON_SKIP_BINARY_DOWNLOAD=1

echo "[verify-tray] run notifyFlow integration test"
npx vitest run electron/main/notify/notifyFlow.test.ts

echo "[verify-tray] done"
```

- [ ] **Step 2: Add Makefile**

根目录 `Makefile`：

```makefile
verify-tray:
	cd desktop && ./scripts/verify-tray-flow.sh
```

- [ ] **Step 3: Make executable**

```bash
chmod +x /workspace/desktop/scripts/verify-tray-flow.sh
```

- [ ] **Step 4: Verify**

```bash
cd /workspace
make verify-tray
```

- [ ] **Step 5: Commit**

```bash
cd /workspace
git add Makefile desktop/scripts/verify-tray-flow.sh
git commit -m "chore(phase5): add make verify-tray"
```

---

## Task 3: 文档 TRAY_GUIDE

**Files**
- Create: `docs/TRAY_GUIDE.md`

- [ ] **Step 1: Write doc**

覆盖：
- 平台行为
- tray-config.json 位置与字段
- FAQ / 排查

- [ ] **Step 2: Commit**

```bash
cd /workspace
git add docs/TRAY_GUIDE.md
git commit -m "docs: add tray guide"
```

---

## Task 4: GitHub Actions（Linux）门禁

**Files**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add workflow**

Linux job：
- checkout
- setup node
- `cd desktop && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`
- `npm test`
- `npm run typecheck`
- `make verify-tray`

- [ ] **Step 2: Commit**

```bash
cd /workspace
git add .github/workflows/ci.yml
git commit -m "ci: add linux tray verification job"
```

---

## Task 5: 最终门禁 + 推送

- [ ] **Step 1: Gate**

```bash
cd /workspace/desktop
npm test
npm run typecheck
cd /workspace
make verify-tray
```

- [ ] **Step 2: Push**

```bash
cd /workspace
git push origin trae/solo-agent-M3pw1t
```

