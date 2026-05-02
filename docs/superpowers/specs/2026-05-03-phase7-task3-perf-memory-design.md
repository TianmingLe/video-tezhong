# Phase 7 Task 3：性能基准 + 内存受控（10k 日志上限）+ 安全清理（Design）

## 0. 目标

- 冷启动提速：减少首屏 bundle 体积与同步计算，降低初始加载成本
- 内存受控：日志展示与缓存严格限制在 10,000 行（两处：任务页实时日志、报告页归档日志）
- 可观测：采集冷启动链路指标（app.whenReady → createWindow → did-finish-load → ready-to-show）
- 清理安全：提供“清理旧日志（保留最近 50）”能力，二次确认后执行，不可误删

## 1. 硬约束

- 离线可用：所有功能不依赖网络；性能指标与日志清理均本地执行
- 100% TypeScript：禁止 any；IPC 与 preload/types.ts 强类型对齐
- 渲染进程零 fs 权限：日志文件扫描/删除必须在主进程完成
- 不修改 Phase 5-6 SQLite schema
- TDD：新增核心逻辑先写失败测试

## 2. 内存受控：日志严格上限 10k

### 2.1 适用范围

- 任务页实时日志：`TaskController` 通过 `window.api.job.onLog` 持续 append
- 报告页归档日志：`ReportPage` 通过 `window.api.job.getArchivedLog` 拉取 chunk 并 append

### 2.2 设计要点

- 统一实现一个纯函数模块 `logBuffer`（renderer 侧），提供：
  - `appendLine(state, line)` / `appendLines(state, lines)` → 返回新 state
  - state 含 `nextId` 与 `items`
  - 超过 `MAX_UI_LOG_LINES = 10_000` 时丢弃最旧数据
- **ID 单调性与隔离（强制）**
  - `nextIdRef` 必须在 `TaskController` 与 `ReportPage` 各自独立实例化（hook/useRef），严禁共享全局计数器
  - 单测必须断言：截断后继续追加，ID 仍严格递增，且不会与被丢弃的旧 ID 重叠

## 3. 启动提速：路由懒加载 + Suspense Skeleton

### 3.1 范围

- 对非首屏页面做 React.lazy 分包：
  - `KnowledgeBasePage`、`SettingsPage`、`ReportsPage`、`ReportPage`
- `TasksPage` 保持同步（首屏）

### 3.2 懒加载防白屏（强制）

- React.lazy 必须搭配 `<Suspense fallback={<Skeleton .../>}>`
- fallback 使用现有 `Skeleton` 组件，避免路由切换出现白屏/布局抖动

## 4. 可观测：冷启动链路指标

### 4.1 指标范围（强制聚焦）

仅统计冷启动链路（不混入任务运行耗时）：
- `t0_appStart`: 主进程入口启动时间（模块加载时）
- `t1_whenReady`: `app.whenReady` 触发
- `t2_createWindow`: BrowserWindow 创建完成
- `t3_didFinishLoad`: `webContents.did-finish-load`
- `t4_readyToShow`: `ready-to-show`

派生展示：
- `whenReadyMs = t1 - t0`
- `createWindowMs = t2 - t0`
- `didFinishLoadMs = t3 - t0`
- `readyToShowMs = t4 - t0`

### 4.2 调试开关（保持界面整洁）

- IPC 始终可用，但 UI 只在 Settings 页提供折叠面板（`<details>`）展示“开发者指标”

## 5. 安全清理：旧任务日志（保留最近 50）

### 5.1 目标目录

- `<userData>/logs/*.log`（由 `createLogArchive` 写入）

### 5.2 安全护栏（强制）

- Settings 触发清理前必须二次确认：
  - 先通过 IPC 预估待删除数量 N（preview）
  - 再弹出确认对话框：提示“将删除 N 个 .log 文件，不可恢复”
  - 用户确认后才执行删除（cleanup）

### 5.3 删除策略

- 仅删除 `.log` 文件
- 按文件 mtime 倒序保留最近 50
- 删除失败不影响应用启动与其他功能；返回错误字符串供 toast 展示

