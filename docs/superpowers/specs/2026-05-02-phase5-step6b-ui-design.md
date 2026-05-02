# Phase 5 Step 6B：队列可视化 + 归档日志分块读取 + Skeleton（Design）

## 1. 目标

- 队列状态可视化：在 TasksPage 顶部显示 Running/Pending，且由主进程主动推送（无轮询）
- 归档日志读取：ReportPage 可在刷新/重启后从 `<userData>/logs/<runId>.log` 分块加载日志，并支持大文件（>50MB）避免一次性读入
- 加载体验：ReportsPage / KnowledgeBasePage / SettingsPage 等 IPC 页面统一使用 Skeleton，避免白屏与布局抖动

## 2. 非目标

- 不引入 Tailwind / styled-components（使用现有 CSS 体系补少量样式）
- 不做 Playwright E2E（后续阶段引入）

## 3. IPC 与事件流

### 3.1 job:queueUpdate（主进程 → 渲染）

- 主进程在队列状态变更时推送：
  - 入队（queued）
  - 出队/启动（running）
  - 退出/取消（exited/cancelled）
- Payload：

```ts
type QueueUpdatePayload = {
  maxConcurrency: number
  running: string[]
  pending: number
}
```

- 频率控制：
  - 主进程对推送做 throttle（200ms，合并多次变更）
  - 渲染进程再以 React state 更新（避免频繁重渲染）

### 3.2 job:getArchivedLog（渲染 → 主进程）

- 用于读取 `<userData>/logs/<runId>.log` 的分块内容：

```ts
type GetArchivedLogArgs = {
  runId: string
  offset: number
  chunkSize: number
}

type GetArchivedLogResult =
  | { success: true; offset: number; nextOffset: number; eof: boolean; text: string }
  | { success: false; error: string }
```

- 约束：
  - `chunkSize` 上限（例如 256KB）强制裁剪，防止一次性读取过大阻塞主进程
  - 读取失败或文件不存在返回 `{ success: true, eof: true, text: '' }` 或 `{ success: false, error }`（由 UI 决定 fallback）

## 4. 渲染层状态管理

### 4.1 QueueStatusContext

- 在 AppShell 处订阅 `window.api.job.onQueueUpdate(cb)` 并写入 Context
- TasksPage 顶部渲染 `<QueueStatusCard />`

### 4.2 乐观更新

- Start：
  - 点击后立即禁用“开始任务”按钮（直到收到 `queued/started` 或 error）
- Cancel：
  - 点击后立即禁用“取消”按钮（直到 status 变为 exited/cancelled/error）

目的：提升跟手感，避免 IPC 往返期间重复点击。

## 5. 归档日志加载方案

- ReportPage 优先从 `job:getArchivedLog` 拉取归档日志
- 初始目标：首屏解析到 500 行（或直到 eof）
  - 多次拉 chunk，累计 lines >= 500 即停止
- LogViewer 保持虚拟滚动（已使用 `@tanstack/react-virtual`）
- 滚动到底部时继续拉取下一块（直到 eof）
- UI：
  - skeleton/Loading 提示
  - error 状态与重试按钮

## 6. Skeleton 组件规范

- 新增 `components/Skeleton.tsx`，提供：
  - `Skeleton`（单块）
  - `SkeletonLines`（多行）
- 样式：
  - 统一灰色占位 + shimmer 动画
  - 容器高度固定，避免布局抖动

## 7. SQLite 锁竞争与降级（补强项）

- `better-sqlite3` 设置 `busy_timeout`（例如 3000ms）
- tasksRepo/configsRepo 写操作遇到 `SQLITE_BUSY` 时：
  - 最小重试（指数退避 3 次）
- 若 DB 打开失败或 schema 执行失败：
  - 进入只读模式：读操作返回空数组或已有缓存；写操作返回错误但不 crash 主流程

## 8. 原生依赖打包预案（文档项）

- 在 `docs/TRAY_GUIDE.md` 或新增 `docs/BUILD_NATIVE_DEPS.md` 记录：
  - `better-sqlite3` 的 `.node` 依赖在 electron-vite 打包时的处理策略（后续补齐）

