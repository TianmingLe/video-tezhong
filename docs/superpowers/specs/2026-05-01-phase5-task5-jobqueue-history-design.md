# Phase 5 Task 5：并发队列 / 任务历史 / 报告 & KB 联动（Design）

## 1. 目标

在保持 Electron 安全边界（渲染进程无 `child_process/fs`、主进程通过 preload 最小 API 暴露）的前提下，实现：

- JobQueue 并发控制（默认最大并发 2）
- 任务排队与状态可观测（queued/running/exited/error/cancelled）
- 进程树清理（tree-kill）避免子进程残留
- 任务历史持久化（electron-store）
- ReportsPage 展示历史记录并支持跳转报告/复用配置
- 知识库模板持久化（electron-store），支持“保存为模板/一键复用”

## 2. 非目标

- 更复杂的作业编排（依赖图、优先级、多队列）
- SQLite（better-sqlite3）持久化（本阶段采用 electron-store，后续可迁移）
- 完整报告生成器（此阶段重点是历史与联动；报告页面继续以日志/元信息为核心）

## 3. 主进程：JobQueue

### 3.1 数据模型

```ts
type JobState = 'queued' | 'running' | 'exited' | 'error' | 'cancelled'

type JobRequest = {
  runId: string
  script: string
  args: string[]
  env?: Record<string, string>
  meta: { scriptName: string; scenario: string }
}
```

### 3.2 行为

- `MAX_CONCURRENCY=2`（常量，后续可配置化）
- `enqueue(req)`：
  - 若 running < MAX：立即启动（state=running）
  - 否则入队（state=queued，返回 position）
- `cancel(runId)`：
  - queued：从队列移除，state=cancelled
  - running：通过 tree-kill 清理 PID 树，state=cancelled（最终仍会收到 exited 事件，需去重/最终态一致）
- `onProcessExit(runId, code, signal)`：更新状态并触发队列唤醒

### 3.3 与 PythonProcessManager 的关系

- JobQueue 负责调度；PythonProcessManager 负责 spawn/kill/log
- JobQueue 订阅 PythonProcessManager 的 start/exit/error 事件
- JobQueue 作为 IPC `job.start/job.cancel` 的唯一入口（渲染进程不直接控制 spawn）

## 4. 主进程：HistoryStore（electron-store）

### 4.1 历史记录结构

```ts
type TaskHistoryItem = {
  runId: string
  scriptName: string
  scenario: string
  status: JobState
  exitCode: number | null
  startTime: number | null
  endTime: number | null
}
```

### 4.2 写入时机

- enqueue：写入/更新为 queued
- start：更新为 running + startTime
- exited/error/cancel：更新 endTime/exitCode/status

## 5. 主进程：TemplatesStore（electron-store）

```ts
type TaskTemplate = {
  id: string
  title: string
  tags: string[]
  createdAt: number
  config: { scriptName: string; scenario: string }
}
```

## 6. IPC 与 preload API（最小暴露）

### 6.1 job API（扩展返回值与状态）

- `job.start(config)` 返回：
  - `{ success: true, state: 'running' }` 或 `{ success: true, state: 'queued', position: number }`
  - 错误返回 `{ success: false, error }`
- `job:status` 增加状态：
  - `queued`、`cancelled`（并保留 started/exited/error）

### 6.2 history API

- `history.list() -> TaskHistoryItem[]`
- `history.get(runId) -> TaskHistoryItem | null`

### 6.3 templates API（KB 联动）

- `templates.list() -> TaskTemplate[]`
- `templates.save({ title, tags, config }) -> TaskTemplate`

## 7. 渲染进程 UI

### 7.1 ReportsPage

- 拉取 `history.list()` 展示历史
- 点击条目 → `/report/:runId`
- “重新运行”按钮 → 预填 TasksPage（复用现有 sessionStorage preset 或升级为 router state）

### 7.2 TaskConfigForm

- 增加“保存为模板”按钮：
  - 采集 title/tags（最小对话框或 inline 输入）
  - 调用 `templates.save(...)`

### 7.3 KnowledgeBasePage / KnowledgeList

- 从 `templates.list()` 渲染模板列表（mock 数据退场）
- 点击模板：
  - 回填 TasksPage（scriptName/scenario）
  - 可选：直接运行（本阶段先回填）

## 8. 测试策略（TDD）

- JobQueue 单测（纯逻辑 + 注入 fake runner）：
  - 并发=2 时第 3 个进入 queued
  - running 退出后 queued 自动转 running
  - cancel queued 移除队列
  - cancel running 触发 tree-kill（mock）
- HistoryStore/TemplatesStore 单测（注入 store adapter，避免真实磁盘）
- 渲染侧 minimal 单测（纯函数/小工具，不强行上 React Testing Library）

## 9. 验收标准

- `npm test`、`npm run typecheck` 全绿
- 连续启动 3 个任务：2 running + 1 queued；任一退出后 queued 自动启动
- ReportsPage 可看到历史并跳转报告页
- KB 可保存模板并复用预填

