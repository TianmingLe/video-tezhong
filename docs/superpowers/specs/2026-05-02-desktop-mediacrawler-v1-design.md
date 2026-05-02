# Desktop 内置 MediaCrawler 管道（V1）设计

## 0. 背景与目标

当前桌面端任务系统本质是“运行任意 Python 脚本”，尚未把 `MediaCrawler`（dy/xhs/bili 等采集框架）做成**内置的一键管道**，用户仍需自己写/找脚本。与此同时：

- 缺少生产级任务模板库与参数校验
- 缺少失败自动重试/资源限制等管控
- 报告页以日志为主，未消费结构化产物

V1 目标聚焦在“把 MediaCrawler 深度绑定到 Desktop 的任务与报告体系”，并做到可发布、可复现、可排障：

1. Desktop 提供 **一键任务模板**（dy MVP / xhs 搜索 / bili 搜索）
2. Desktop 主进程提供 **Python venv 管理 + 依赖自动安装**（用户仅需系统 Python）
3. Desktop 在提交前与主进程双重 **参数校验**，避免命令注入与无效参数
4. Report 页除日志外，能展示 **MediaCrawler 产出的 Markdown 报告预览**（V1 只做预览；图表/LLM 放在 V2/V3）

---

## 1. 范围

### 1.1 本期包含

- 任务模板（内置）：
  - 抖音 dy：MVP（detail → 下载 → ASR → 结构化输出）
  - 小红书 xhs：搜索任务（关键词/数量等）
  - B 站 bili：搜索任务（关键词/数量等）
- Python venv 自动安装：
  - 检测系统 Python 版本（最低 3.11）
  - 在 `<userData>/python/mediacrawler-venv/` 创建 venv
  - `pip install -r MediaCrawler/requirements.txt`
  - 可选安装 Playwright 浏览器（按任务需要）
- 任务提交与运行：
  - “任务配置 → 受控 args builder → job.start”
  - 任务运行日志落盘（已有）+ 报告产物写入 `results/runs/<runId>/`（MediaCrawler 已有约定）
- 报告预览：
  - 若发现 `results/runs/<runId>/*.md`，在 Report 页提供 “Report” Tab 渲染 Markdown

### 1.2 明确不做（后续版本）

- LLM 评论聚类/情感/结构化提取（Roadmap 阶段 2）
- 报告可视化图表（时间轴/指标图/词云等）
- 任务级 CPU/内存限制（需要更底层的 OS 级或容器化方案）
- 全面通用“任意平台任意参数”的 UI（V1 先提供三条生产级范式）

---

## 2. 架构设计

### 2.1 受控执行：Runner 方案

采用“受控 Runner + 配置文件”方式，避免渲染进程直接拼接任意 CLI：

- Renderer：生成 `MediaCrawlerTaskSpec`（严格类型 + zod 校验）
- Main：再次校验并生成配置 JSON 文件，写到 `<userData>/runs/<runId>/task.json`
- Main：调用 venv python 执行 `desktop/resources/python/run_mediacrawler.py <task.json>`
- Runner：读取 task.json，映射到 MediaCrawler CLI（或直接 import 并调用），并以 JSON 行输出结构化进度事件（用于未来时间轴/图表）

### 2.2 Python 运行时策略（生产级）

用户侧要求：

- 用户只需要安装系统 Python（但必须 >=3.11）
- Desktop 自动创建/复用 venv 并安装依赖

主进程实现：

- `PythonEnvManager`
  - `ensureMediacrawlerEnv()`：如果 venv 不存在/版本不匹配/requirements hash 变化 → 重新创建并安装
  - 安装过程通过 job log 反馈（可见进度）
  - 安装失败给出明确错误与建议（代理、pip 源、权限等）

### 2.3 任务模板库（生产级）

内置模板以代码方式固化（不可变），用户可另存为自定义模板（写入 sqlite configs 表）。

- 内置模板：`desktop/electron/renderer/src/features/task/templates/mediacrawlerTemplates.ts`
- 用户模板：沿用现有 KB（configs）能力，存储 `taskSpecJson`（需要扩展 configs 表结构）

### 2.4 数据存储与兼容

现有 schema：

- `tasks`：仅 run_id/script/scenario/status/exit_code
- `configs`：name/script/scenario/env/is_default

V1 需要新增字段以支撑生产级模板与重放：

- `configs.task_spec_json TEXT`：完整任务 spec（JSON string）
- `tasks.task_spec_json TEXT`：用于报告页回放与诊断（JSON string）
- `tasks.attempt INTEGER` / `tasks.max_attempts INTEGER`：为后续 retry 打基础（V1 可以先写入但不启用自动重试）

initDb 需要支持“增量加列”（避免已有用户 DB 无法升级）。

---

## 3. UI/交互设计（V1）

### 3.1 Tasks 页面

- 新增 “模板选择” 区域：
  - 内置：dy/xhs/bili
  - 用户自定义：现有 Knowledge Base（configs）
- 表单按模板展示对应字段（例如 dy 需要 aweme_url/aweme_id，xhs/bili 需要 keywords/limit）
- 点击提交前：
  - Renderer 使用 zod 校验（阻止空值/非法值）
  - 提示当前会使用/安装 Python 环境（首次可能较慢）

### 3.2 Reports 页面

- Tabs：
  - Logs（现有）
  - Report（新）：渲染 `results/runs/<runId>/*.md`（优先 `kb_summary_*.md` 或 `mvp_report_*.md`）

---

## 4. 验收标准（V1）

### 4.1 功能验收

- Desktop 可从模板一键创建 3 类任务（dy/xhs/bili），并能启动运行
- 首次运行会自动创建 venv 并安装依赖；再次运行复用 venv
- Python 版本不足会在 Onboarding/任务提交处给出清晰提示
- Report 页在存在 `.md` 产物时可预览（Markdown）

### 4.2 工程验收

- `cd desktop && npm test` PASS
- `cd desktop && npm run typecheck` PASS
- Nightly / Release CI 不新增失败项

