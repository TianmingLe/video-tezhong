# Phase 6 (CI/CD + Crash + E2E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Phase 5 runbook 自动化为 GitHub Actions 多平台打包与 Draft Release；补齐轻量崩溃捕获落盘；提供 Playwright E2E 套件（本地可跑 + workflow_dispatch），默认不进入 CI gating。

**Architecture:** Desktop 侧引入 electron-builder 打包配置（asarUnpack better-sqlite3），release workflow 走 matrix build + draft release；Crash Reporter 由 main/renderer 事件捕获 + 主进程落盘 JSON；E2E 使用 @playwright/test 的 Electron launcher 进行关键旅程验证，单独 workflow 手动触发。

**Tech Stack:** electron-vite + electron-builder + GitHub Actions + vitest + @playwright/test

---

## 0. File Map

**Create**
- `.github/workflows/release.yml`
- `.github/workflows/e2e.yml`
- `desktop/electron-builder.yml`
- `desktop/electron/main/crash/crashWriter.ts`
- `desktop/electron/main/crash/registerMainCrashHandlers.ts`
- `desktop/electron/main/crash/crashWriter.test.ts`
- `desktop/electron/main/crash/ipcCrashBridge.ts`
- `desktop/electron/renderer/src/crash/registerRendererCrashHandlers.ts`
- `desktop/electron/renderer/src/crash/rendererCrashBridge.ts`
- `docs/CRASH_GUIDE.md`
- `desktop/playwright.config.ts`
- `desktop/tests/e2e/task-queue-flow.spec.ts`
- `desktop/tests/e2e/tray-notification.spec.ts`

**Modify**
- `desktop/package.json` / `desktop/package-lock.json`
- `desktop/electron/main/index.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/shared/ipc.ts` / `ipc.test.ts`

---

## Task 1: electron-builder + release workflow（Linux 先跑通）

**Files**
- Modify: `desktop/package.json`
- Create: `desktop/electron-builder.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write failing check（builder scripts 存在）**

更新 `desktop/package.json` scripts，新增：
- `dist`（electron-vite build + electron-builder）
- `pack`（electron-builder --dir 可选）

在本地先跑：

```bash
cd /workspace/desktop
npm run dist -- --help
```

Expected: electron-builder 存在，否则 fail（RED）

- [ ] **Step 2: Add dependencies**

```bash
cd /workspace/desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund -D electron-builder
```

- [ ] **Step 3: Add electron-builder.yml**

必须包含：
- `appId: pro.omniscraper.desktop`
- `productName: OmniScraper Desktop`
- `asar: true`
- `asarUnpack: ["**/node_modules/better-sqlite3/**"]`
- `linux.target: AppImage`
- `win.target: nsis`
- `mac.target: dmg`

- [ ] **Step 4: Add release workflow（matrix）**

`release.yml`：
- matrix: ubuntu/windows/macos
- steps:
  - setup-node (20)
  - `cd desktop && npm ci`
  - `npm test` / `npm run typecheck`
  - `npm run dist`
  - upload artifact
- draft release job: gather artifacts → create draft release → upload

签名占位：
- 若 secrets 存在，仅打印 “CSC_LINK present: true/false”（不输出内容）
- 默认 `CSC_IDENTITY_AUTO_DISCOVERY=false`

- [ ] **Step 5: Gate**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
cd /workspace
git add desktop/package.json desktop/package-lock.json desktop/electron-builder.yml .github/workflows/release.yml
git commit -m "ci: add electron-builder release workflow"
```

---

## Task 2: Crash Reporter（TDD）

**Files**
- Create: `desktop/electron/main/crash/crashWriter.test.ts`
- Create: `desktop/electron/main/crash/crashWriter.ts`
- Create: `desktop/electron/main/crash/registerMainCrashHandlers.ts`
- Create: `desktop/electron/main/crash/ipcCrashBridge.ts`
- Create: `desktop/electron/renderer/src/crash/registerRendererCrashHandlers.ts`
- Create: `desktop/electron/renderer/src/crash/rendererCrashBridge.ts`
- Modify: `desktop/electron/shared/ipc.ts` / `ipc.test.ts`
- Modify: `desktop/electron/preload/types.ts` / `preload/index.ts`
- Modify: `desktop/electron/main/index.ts`
- Create: `docs/CRASH_GUIDE.md`

- [ ] **Step 1: Write failing test（落盘 JSON）**

在 `crashWriter.test.ts`：
- 使用 `fs.mkdtemp` 创建临时 userData
- 调用 `writeCrashEvent({ ... })`
- 断言生成 `<tmp>/crash/*.json` 且字段包含 timestamp/pid/process/message/stack/context.lastRunId

- [ ] **Step 2: Implement crashWriter（可注入 fs）**

- [ ] **Step 3: Implement main handlers**

`registerMainCrashHandlers({ write, getLastRunId })`

- [ ] **Step 4: Renderer 捕获并通过 IPC 上报**

新增通道：
- `crash:report`（renderer → main）

preload 暴露：
- `app.reportCrash(event)` 或内部自动上报（推荐自动）

- [ ] **Step 5: main/index.ts 接线**

在 app ready 后调用 `registerMainCrashHandlers`

- [ ] **Step 6: docs**

写 `docs/CRASH_GUIDE.md`：
- 路径
- 字段解释
- 如何打包收集样本

- [ ] **Step 7: Gate + Commit**

---

## Task 3: Playwright E2E（本地可跑 + workflow_dispatch）

**Files**
- Modify: `desktop/package.json`
- Create: `desktop/playwright.config.ts`
- Create: `desktop/tests/e2e/task-queue-flow.spec.ts`
- Create: `desktop/tests/e2e/tray-notification.spec.ts`
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Add deps**

```bash
cd /workspace/desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund -D @playwright/test
```

- [ ] **Step 2: Add scripts**

`package.json`：
- `test:e2e`: `playwright test`

- [ ] **Step 3: Implement tests**

- `task-queue-flow`：启动 → 填表 → 启动 2 个任务 → 观察 QueueStatusCard → 等待跳转 report
- `tray-notification`：只做最小可验证（允许 skip/soft 断言），避免不同 OS 不一致

- [ ] **Step 4: Add e2e workflow（workflow_dispatch）**

Linux 优先；不阻断 release workflow。

- [ ] **Step 5: Gate（本地）**

```bash
cd /workspace/desktop
npm run test:e2e
```

- [ ] **Step 6: Commit**

---

## Task 4: 最终门禁 + 推送

- [ ] **Step 1**

```bash
cd /workspace/desktop
npm test
npm run typecheck
```

- [ ] **Step 2**

```bash
cd /workspace
git push origin trae/solo-agent-M3pw1t
```

