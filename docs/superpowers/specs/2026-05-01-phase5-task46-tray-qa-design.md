# Phase 5 Task 4-6：托盘闭环最终集成验证与文档（Design）

## 1. 目标

补齐 Task 4 的“交付最后一公里”，在不引入不稳定的 headless UI 测试前提下，实现：

- CI 可稳定执行的托盘/通知/跳转链路集成验证（Mock 注入）
- 本地一键验证入口（`make verify-tray`）
- 用户文档（跨平台行为、配置项、排查）
- GitHub Actions Linux 门禁（可复用本地验证）

## 2. 非目标

- 不在 CI 中尝试真实托盘/真实系统通知 UI（Xvfb + 系统托盘在多数 runner 上不稳定）
- 不新增 JobQueue / kill-tree / sqlite（已在 Task 4 范围外）

## 3. 核心设计

### 3.1 notifyFlow：可注入的通知触发链路

新增主进程模块 `notifyFlow.ts`，将“创建通知 + 点击后恢复窗口并导航”的逻辑从 `main/index.ts` 中抽出，变为可测试的纯业务流程函数：

- 输入：`runId`、`exitCode`、`platform`
- 依赖注入：
  - `createNotification(payload) -> { onClick(cb); show() }`
  - `showAndFocusWindow()`
  - `sendNavigate(path)`

这样 CI 中无需 Electron 原生 Notification 实例，也无需真实窗口/托盘即可断言链路正确。

### 3.2 本地验证脚本

新增 `desktop/scripts/verify-tray-flow.sh`：

- 以“可重复、可在 CI 执行”为目标，仅运行 `notifyFlow.test.ts`（链路集成断言）
- 输出结构化日志（stdout）
- 不依赖 GUI，不做截图（CI 不稳定；文档提供人工截图指导）

### 3.3 Makefile（根目录）

新增根目录 `Makefile`：

- `verify-tray`：调用 `desktop/scripts/verify-tray-flow.sh`

### 3.4 文档 TRAY_GUIDE

新增 `docs/TRAY_GUIDE.md`：

- 跨平台默认行为（mac 左键 menu；win/linux 左键 toggle）
- 配置文件：`tray-config.json` 位置与字段说明（leftClick/rightClick/showBadgeOnRunning）
- 常见问题（托盘图标不显示、通知权限、mac 静音策略等）

### 3.5 GitHub Actions（Linux）

新增 `.github/workflows/ci.yml`：

- 仅 Linux job
- steps：
  - `cd desktop && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`
  - `npm test`
  - `npm run typecheck`
  - `make verify-tray`

## 4. 验收标准

- `make verify-tray` 本地可运行并 PASS
- `npm test`、`npm run typecheck` 全绿
- 文档覆盖配置项与平台差异
- CI Linux job 可稳定 PASS

