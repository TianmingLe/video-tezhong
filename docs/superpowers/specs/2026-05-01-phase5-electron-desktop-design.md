# Phase 5：Electron 桌面端封装（零修改 Python 后端）设计文档

## 1. 目标与边界

### 1.1 目标

基于现有 `python main.py ...` CLI，构建 Electron 桌面应用，实现：

- 配置面板（生成 CLI 参数）
- 实时进度（日志流）
- 报告预览（读取 `results/runs/<run_id>/` 下的 `.md/.json`）
- 一键导出（打包导出单次 run 的目录或指定文件）
- 系统托盘（最小化到托盘、后台继续运行、任务完成通知）
- 多任务队列 + 任务历史（你已确认需要）

### 1.2 架构边界（硬约束）

- Python 后端代码完全不动（不新增 API、不改 WebSocket、不加参数）
- Electron 仅作为 UI 壳 + 进程管理器
- 通过 `child_process.spawn` 调用 `python main.py ...`
- 通过 stdout/stderr 管道实时捕获日志并推送到渲染进程
- 结果文件直接从磁盘读取渲染（不走 HTTP API）

### 1.3 默认假设（可后续调整）

为满足“打包后无需手动配 Python 环境”，本期采用：

- **内置 Python + 核心依赖**（随安装包发布）
- **Playwright 浏览器资源按需安装/下载**（设置页提供一键检查/安装入口）

说明：该策略兼顾“可离线安装”与“避免安装包体积极端膨胀”。若你后续希望“首次运行下载全部资源”，可在 Phase 5.1 再切换。

---

## 2. 仓库结构（新增）

新增一个独立前端工程目录（避免影响现有 Python 包与 docs 工程）：

```
/workspace/desktop/
  package.json
  electron.vite.config.ts
  src/
    main/          # Electron 主进程
    preload/       # 预加载脚本（contextBridge）
    renderer/      # React UI
  resources/       # 图标、托盘图标等
```

---

## 3. 进程与数据流

### 3.1 关键对象

- **Task（任务配置）**：用户在 UI 中填写的参数集合（platform/type/keywords/limit/ocr/llm 等）
- **Job（一次运行）**：Task 的一次执行实例（包含 `jobId`、生成的 `runId`、进程 pid、日志、状态、产出路径）
- **Queue（队列）**：待执行/执行中/已完成的 job 列表，支持并发=1（默认串行，降低风控）

### 3.2 Job 生命周期

`queued → starting → running → succeeded|failed|cancelled`

### 3.3 run_id 解析与文件定位

Python 侧在 search 模式会生成：

- `results/runs/<run_id>/...`

Electron 侧定位策略（不改 Python 的情况下）：

1) spawn 前记录 `results/runs/` 目录的最新 mtime 快照
2) 运行期间监听 stdout 日志，若命中形如 `results/runs/<run_id>/` 的路径则直接采信
3) 若未命中，进程退出后对比 `results/runs/` 目录新增项，取最新目录作为本次 run_id

### 3.4 日志通道

主进程捕获：

- `child.stdout.on("data")`
- `child.stderr.on("data")`

将日志按行切分后通过 IPC 推送到渲染进程：

- `ipcMain` 维护每个 job 的 ring buffer（例如最多保留 20k 行）
- 渲染进程订阅当前 job 日志流，实现“实时滚动控制台”

---

## 4. IPC 设计（主进程 ↔ 渲染进程）

使用 `contextIsolation: true` + `preload` 暴露安全 API：

### 4.1 preload 暴露 API（示例）

- `job.create(task) -> jobId`
- `job.start(jobId) -> void`
- `job.cancel(jobId) -> void`
- `job.onLog(cb)`：订阅日志事件（包含 jobId、level、line、ts）
- `job.onStatus(cb)`：订阅状态变更
- `runs.list() -> RunMeta[]`：读取 `results/runs` 下的历史 run
- `runs.readReport(runId, index?, videoId?) -> markdown`
- `runs.readAnalysis(runId, index?, videoId?) -> json`
- `runs.export(runId, targetDir) -> void`
- `app.openPath(path) / app.showItemInFolder(path)`

### 4.2 安全约束

- 渲染进程不允许任意执行 shell
- 所有文件操作限定在项目工作目录（默认 `/workspace/MediaCrawler` 对应的真实安装目录）

---

## 5. UI 信息架构（你选择的布局 A）

左侧导航 + 主工作区：

- 任务（Tasks）
  - 新建任务：配置表单
  - 队列列表：排队/运行中/已完成
  - 任务详情：日志 + 结果快捷入口
- 控制台（Console）
  - 聚合展示当前 job 日志（支持过滤/搜索/复制）
- 报告（Reports）
  - run 列表（从 `results/runs/` 读取）
  - 选择 run → 视频列表 → Markdown 报告预览（支持导出 PDF/HTML：后续扩展）
- 知识库（Knowledge Base）
  - run 维度展示 `kb_summary.md`、`kb_index_*.jsonl`
- 设置（Settings）
  - Python 运行时/依赖检查
  - Playwright 浏览器资源检查/安装入口
  - 默认参数（并发、输出目录、日志保留行数）

---

## 6. 系统托盘与通知

- 托盘菜单：
  - 显示/隐藏窗口
  - 当前任务状态
  - 取消当前任务
  - 退出
- 最小化到托盘：
  - 关闭按钮默认隐藏到托盘（可设置改为退出）
- 任务完成通知：
  - 成功/失败均触发系统通知
  - 点击通知打开对应 run 的报告页

---

## 7. 打包与 Python 运行时策略

### 7.1 Python 路径解析

主进程在不同环境下选择 python 可执行文件：

1) 开发态：优先 `python`（或 `python3`）+ `cwd=<repo>/MediaCrawler`
2) 打包态：优先使用应用内置 python（例如 `resources/python/python.exe` / `resources/python/bin/python3`）

### 7.2 依赖与资源（按需）

- 核心 Python 依赖随包
- Playwright 浏览器资源按需（设置页“检测/安装”）

---

## 8. 测试策略（TDD）

### 8.1 主进程（Node）单测

- `PythonProcessManager`：
  - 能 spawn/kill
  - stdout/stderr 能按行推送
  - runId 推断逻辑正确

### 8.2 渲染进程（React）单测

- 参数表单：输入 → CLI 参数生成结果（纯函数测试）
- 日志控制台：追加日志、过滤、自动滚动行为

### 8.3 最小 E2E（后续增强）

- 启动应用 → 点击开始 → 模拟输出日志 → 自动跳转到报告页

---

## 9. Task 1（初始化 electron-vite + React）验收点

- 工程可 `pnpm dev`（或 npm）启动
- 主进程/预加载/渲染进程结构齐全
- 渲染进程可展示基础壳：
  - 左侧导航（Tasks/Console/Reports/KB/Settings）
  - 主区显示占位页面

