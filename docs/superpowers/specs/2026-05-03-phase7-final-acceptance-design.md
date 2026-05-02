# Phase 7：最终验收（Design）

## 0. 目标

把 Phase 7 的交付从“功能实现”提升为“可发布”状态：

- 质量门禁全绿（unit + typecheck）
- E2E Smoke 全绿（Playwright）
- 构建产物可生成（electron-vite build + electron-builder pack）
- 关键用户路径手工回归（Onboarding/Tasks/Reports/Settings/Feedback/ErrorBoundary）
- 输出一份可审计的验收记录文档（命令、结果、关键路径勾选）

## 1. 验收范围

### 1.1 自动化门禁

- `npm test`
- `npm run typecheck`
- `npm run test:e2e`
- `npm run build`
- `npm run pack`（electron-builder --dir）

### 1.2 手工回归 checklist

#### Onboarding
- Python 检测成功：引导继续、进入主界面
- Python 检测失败：可见错误提示；不会白屏；可引导用户修复

#### Tasks（任务页）
- 提交任务 → 进入队列 → 运行中日志持续输出
- 任务结束：exitCode 正常回传；历史记录可见
- 取消任务：状态正确变化；无 UI 卡死

#### Reports（报告页）
- 历史列表可打开报告
- 归档日志按 chunk 加载正常
- 导出日志可工作（归档缺失时 fallback 也可导出）

#### Settings（设置页）
- 检查更新可触发状态变化（至少无崩溃）
- 清理旧日志：preview → confirm → cleanup → toast 提示
- 反馈问题：生成并复制 → toast 提示 → 文本包含 System/Crash/Last Task/User Input

#### ErrorBoundary（全站）
- 任一路由渲染异常能落入错误页
- 错误页按钮：复制错误信息 / 返回任务页 / 重新加载 可用

## 2. 验收记录输出

新增：`docs/PHASE7_ACCEPTANCE.md`

内容包括：
- Git commit / 分支信息
- 每条门禁命令的运行结果（PASS/FAIL + 关键摘要）
- 手工回归 checklist（勾选）
- 已知限制/未覆盖项（若有）

