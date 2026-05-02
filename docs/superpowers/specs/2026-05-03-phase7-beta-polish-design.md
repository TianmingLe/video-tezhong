# Phase 7：Beta 发布打磨（Auto Update + Onboarding + Perf + UX Errors + i18n Stub + Feedback）（Design）

## 0. 决策

- 更新源：GitHub Releases
- 更新提示：全局 Toast（非阻塞），下载完成后支持“立即重启 / 稍后提醒”
- Onboarding 状态：`<userData>/onboarding.json`（App 元数据，不进 SQLite）
- i18n：仅做架构预留，默认中文（暂不做中英切换与文案搬迁）

## 1. 目标

- Beta 级可分发：安装/更新/错误提示/反馈通道齐全，离线可用
- 自动更新不打扰：后台检查与下载，不阻塞启动；可手动检查
- 新手引导明确：首次启动引导 + Python 检测；可在 Settings 重新触发
- 性能达标：冷启动目标 < 2s（基线记录 + 可回归）；日志视图内存受控
- 错误可解释：用户友好文案 + 一键复制 + crash/日志打包辅助反馈

## 2. Task 1：自动更新（electron-updater）

### 2.1 组件与数据流

- 主进程 `UpdateService` 统一封装 `autoUpdater`：
  - `checkForUpdates()`（启动时触发，延迟到首屏渲染后）
  - `downloadUpdate()`（自动下载）
  - `quitAndInstall()`（用户确认重启）
- 状态机（IPC 对外）：
  - `idle | checking | available | downloading | downloaded | notAvailable | error`
- 渲染侧：
  - `UpdateToastHost` 订阅更新状态 push，下载完成弹出 Toast
  - Toast 操作：`installNow` / `remindLater`

### 2.2 Release 规范（GitHub Releases）

- electron-builder 配置：
  - `publish: provider: github`
  - 产物由 release workflow 上传至 **Latest Release（非 Draft）**
- 更新检查：
  - 启动时检查（不阻塞）
  - Settings/菜单提供“检查更新”

### 2.3 离线降级

- 无网/超时：
  - 状态进入 `error`（error message 归一化为用户友好文案）
  - 不影响其他功能
  - 可手动重试

## 3. Task 2：Onboarding（3 步）

### 3.1 触发规则

- 启动时读取 `<userData>/onboarding.json`
  - 未完成：进入 `/onboarding`
  - 已完成：进入主界面
- Settings 提供“重新开始引导”按钮：清空/重置 onboarding.json 并导航到 onboarding

### 3.2 Python 检测

- 主进程提供 `system:checkPython`：
  - 运行 `python3 --version`（Windows 可兼容 `python --version` 作为 fallback）
  - 返回：`ok:boolean`, `version?:string`, `error?:string`
- 渲染侧第二步展示检测结果与修复建议（仅文案，不做自动安装）

## 4. Task 3：性能优化与基准

### 4.1 启动性能

- 首屏后延迟加载：
  - KB 列表与 Settings 数据（按路由懒加载）
- 主进程：
  - SQLite 单例复用已具备；增加 startup mark（app ready → window shown）

### 4.2 内存与日志

- LogViewer 最大行数硬上限：10k（超过丢弃头部/折叠）
- 日志清理工具（手动触发）：
  - 保留最近 50 个 runId 的日志文件，删除更旧文件
  - 不自动定时（避免误删）

## 5. Task 4：错误提示优化

- Renderer 全局 ErrorBoundary：
  - 捕获渲染异常，显示友好错误页
  - 提供“复制错误信息”按钮（包含 appVersion/platform/runId/错误摘要）
- 与 Phase 6 crash reporter 协同：
  - 指引用户附带 `<userData>/crash/*.json`

## 6. Task 5：i18n 架构预留（默认中文）

- 引入最小 `I18nProvider` 与 `t(key)` API（先本地字典）
- 默认语言：中文
- 不做全量文案迁移（避免 Beta 阶段成本）

## 7. Task 6：反馈通道

- Settings “反馈问题”：
  - 收集：
    - 最近 crash log（若存在）
    - 系统信息（platform/appVersion）
    - 最近 runId 与任务状态（若可得）
  - 输出：
    - 生成 GitHub Issue 模板文本（复制到剪贴板）
    - （可选）打开 mailto 草稿

