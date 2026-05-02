# Phase 6：CI/CD 自动化打包 + 崩溃监控 + E2E 门禁（Design）

## 0. 范围与约束

- 基于分支：`trae/solo-agent-M3pw1t`
- appId：`pro.omniscraper.desktop`（固定）
- productName：`OmniScraper Desktop`
- 原生依赖：
  - `better-sqlite3` 必须 `asarUnpack`，避免打包后 `MODULE_NOT_FOUND`
  - `tree-kill` 跨平台验证
- CI 策略（渐进式）：
  - CI 默认：`npm test` + `npm run typecheck` + `build/package`
  - **CI 不跑完整 E2E UI**（避免 Runner 不稳定）
  - E2E：本地可跑 + workflow_dispatch 手动触发（可选 nightly）
- Crash Reporter：不引入外部 SDK，零额外依赖；仅落盘 JSON；预留未来 Sentry 接口
- 安全边界：不破坏 contextIsolation；不泄露 fs/child_process

## 1. Task 1：多平台打包流水线（GitHub Actions + electron-builder）

### 1.1 技术选型

- 构建：`electron-vite`
- 打包：`electron-builder`
- Release：GitHub Draft Release

### 1.2 产物矩阵

- `ubuntu-latest`：`.AppImage`（优先）
- `windows-latest`：`.exe`（nsis）
- `macos-latest`：`.dmg`

### 1.3 electron-builder 配置要点

- `appId: pro.omniscraper.desktop`
- `productName: OmniScraper Desktop`
- `asar: true`
- `asarUnpack` 至少包含：
  - `**/node_modules/better-sqlite3/**`
- `npmRebuild: true`

### 1.4 CI 签名占位（但默认跳过）

- workflow 读取 secrets 占位：`CSC_LINK / CSC_KEY_PASSWORD / WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD`
- CI 默认跳过签名（例如 `CSC_IDENTITY_AUTO_DISCOVERY=false`），但在日志输出中验证“是否检测到证书注入环境变量”（仅输出布尔，不输出内容）

### 1.5 workflow 结构

- `.github/workflows/release.yml`
  - `on: workflow_dispatch`
  - `jobs.build`（matrix）
    - `npm ci`
    - `npm test`
    - `npm run typecheck`
    - `npm run dist`（electron-vite build + electron-builder）
    - upload artifact
  - `jobs.draft_release`（needs build）
    - 下载 artifacts
    - 创建 draft release
    - 上传产物

## 2. Task 2：崩溃监控（Crash Reporter）

### 2.1 主进程捕获

- `process.on('uncaughtException')`
- `process.on('unhandledRejection')`

### 2.2 渲染进程捕获

- `window.addEventListener('error')`
- （可选）`window.addEventListener('unhandledrejection')`

### 2.3 落盘策略

- 目录：`<userData>/crash/`
- 文件：`<timestamp>-<pid>-<process>.json`
- JSON 字段：
  - `timestamp`（ms）
  - `pid`
  - `process`：`main | renderer`
  - `message`
  - `stack`
  - `context`（minimal）
    - `platform`
    - `appVersion`
    - `lastRunId`（来自当前 active runId）
    - `route`（renderer 可选）

### 2.4 安全约束

- 不记录 secrets/env 全量；如需 env，必须白名单键（本阶段默认不写 env）

### 2.5 接口预留

- `reporter` 接口：
  - `writeToDisk(event)`
  - `sendToRemote(event)`（空实现，占位）

### 2.6 测试

- vitest：注入临时目录 + mock error 触发，断言文件生成与字段结构
- IPC 测试：renderer 上报到 main 后落盘（不启动真实 Electron）

## 3. Task 3：Playwright E2E（本地可跑 + 手动触发）

### 3.1 依赖与配置

- `@playwright/test`
- `playwright.config.ts`
- npm scripts：
  - `npm run test:e2e`

### 3.2 用例（至少 2 条，满足你最新约束）

- `task-queue-flow`
  - 提交 2 个任务 → 队列状态变化 → 任务结束 → 自动跳转 ReportPage
- `tray-notification`
  - 最小化/隐藏 → 触发完成事件 → 验证通知点击恢复窗口
  - 说明：在 CI 中不作为 gating（仅 workflow_dispatch 执行）

### 3.3 CI 集成

- `.github/workflows/e2e.yml`
  - `on: workflow_dispatch`
  - Linux 优先（先跑通）
  - 失败不阻断 release workflow（后续可升级为 gating）

## 4. 交付物

- `.github/workflows/release.yml`
- `.github/workflows/e2e.yml`
- `desktop/electron-builder.yml`（或 package.json#build）
- `desktop/electron/main/crash/*`
- `desktop/electron/renderer/src/crash/*`
- `docs/CRASH_GUIDE.md`
- `desktop/tests/e2e/*`

