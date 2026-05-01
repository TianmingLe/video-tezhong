# Phase 5 Task 5（SQLite版）：JobQueue / 进程树清理 / 历史&KB / 日志归档（Design）

## 1. 决策

- 替换并清理：移除 electron-store 与其实现（history/templates）
- 不做数据迁移：SQLite 空库启动即可
- CI 只跑 unit：`npm test` + `npm run typecheck`（不做打包）

## 2. 目标

- better-sqlite3 做元数据持久化：任务历史（tasks）+ 配置模板（configs）
- JobQueue 并发控制（MAX=2），并提供 `queued/running/exited/error/cancelled` 完整状态机
- tree-kill 实现 kill process tree，杜绝 Python 子进程残留
- 日志按 runId 归档到 `<userData>/logs/<runId>.log`（避免大文本入库）
- ReportsPage 使用 SQLite 拉取 tasks 列表（过滤/跳转/复用）
- KnowledgeList 使用 SQLite 拉取 configs（保存/复用）

## 3. 数据库

### 3.1 文件位置

- DB：`<userData>/omniscraper.db`
- Logs：`<userData>/logs/<runId>.log`

### 3.2 Schema（初始化 SQL）

`tasks`：
- `id` INTEGER PRIMARY KEY
- `run_id` TEXT UNIQUE NOT NULL
- `script` TEXT NOT NULL
- `scenario` TEXT NOT NULL
- `status` TEXT NOT NULL
- `exit_code` INTEGER
- `start_time` INTEGER
- `end_time` INTEGER
- `duration` INTEGER

`configs`：
- `id` INTEGER PRIMARY KEY
- `name` TEXT NOT NULL
- `script` TEXT NOT NULL
- `scenario` TEXT NOT NULL
- `gateway_ws` TEXT
- `env` TEXT NOT NULL（JSON 字符串）
- `is_default` INTEGER NOT NULL DEFAULT 0

## 4. 主进程模块拆分

### 4.1 db（better-sqlite3 单例）

`main/db/index.ts`：
- `getDb()` 单例
- `run/get/all/transaction`
- 启动时 `initDb()` 执行 schema.sql

### 4.2 repositories（SQL 封装）

`main/db/tasksRepo.ts`：
- `upsertTask(...)`
- `listTasks({limit, status?, script?})`
- `getTaskByRunId(runId)`

`main/db/configsRepo.ts`：
- `saveConfig(...)`
- `listConfigs()`
- `setDefaultConfig(id)`（预留）

### 4.3 JobQueue（调度）

- maxConcurrency=2（常量）
- `enqueue(request)`：
  - 不满→启动
  - 满→queued，返回 position
- `cancel(runId)`：
  - queued：移除并发 cancelled
  - running：tree-kill(pid) 并标记 cancelled

### 4.4 日志归档

`main/logArchive.ts`：
- `append(runId, line)`：追加到 `<userData>/logs/<runId>.log`
- `read(runId)`：读取完整日志（ReportPage 读取用）
- `export(runId, savePath)`：copy 或写出

## 5. IPC（最小边界）

新增 channels：
- `job:queueStatus`
- `job:history`（最近 50 条 tasks）
- `kb:listConfigs`
- `kb:saveConfig`

保留并调整：
- `job:start`：返回 running/queued
- `job:cancel`
- `job:exportLog`：优先从日志文件导出

渲染端暴露（preload）：
- `window.api.job.queueStatus()`
- `window.api.job.history()`
- `window.api.kb.listConfigs()`
- `window.api.kb.saveConfig(input)`

## 6. Renderer UI

- ReportsPage：显示 tasks 列表（status/script 过滤），点击跳 `/report/:runId`
- KnowledgeList：从 configs 表读，点击预填
- TaskConfigForm：保存为模板 → `kb.saveConfig`

## 7. 清理（替换并清理）

- 移除依赖：electron-store
- 移除文件：`main/store/historyStore*`、`main/store/templatesStore*`
- 移除 IPC：`history:*`、`templates:*`，替换为 `job:history`、`kb:*`

## 8. 测试策略

- db 层：使用临时 sqlite 文件（`os.tmpdir`）+ transaction 回滚
- repo：upsert/list/get 覆盖
- kill-tree：mock tree-kill 调用次数与参数
- JobQueue：并发=2 + queued 唤醒 + cancel queued/running

