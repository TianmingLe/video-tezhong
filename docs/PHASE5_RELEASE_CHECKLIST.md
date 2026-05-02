# Phase 5 发布前 Checklist（SQLite + JobQueue + Tray + UI + Reliability）

> 目标：在进入稳定期前，用最少的步骤验证“能构建、能运行、能回归、能回滚”。

## 1. 原生依赖与构建预案

- **跨平台依赖编译验证**
  - Windows/macOS/Linux 上分别验证 `better-sqlite3` 原生模块可被正确安装与加载（避免 `.node` 缺失导致启动白屏）。
  - Windows 重点：MSVC Build Tools / Python / node-gyp 依赖是否齐全（CI Runner/开发机均需覆盖）。
  - macOS 重点：x64/arm64 架构一致性（Apple Silicon 环境确保生成 arm64 或 universal）。
- **electron-vite 打包原生依赖策略**
  - 明确 `better-sqlite3` 的 `.node` 文件在打包产物中的位置与加载路径（asar 内/asar 外）。
  - 在打包配置中显式声明原生依赖处理策略（例如：强制 asarUnpack / externalize native deps）。
  - 生成产物后做一次“冷启动自检”：启动即执行一次最小 DB 读写（建表 + insert + select）。
- **tree-kill 跨平台行为验证**
  - Windows：确认对 pid tree 的清理策略符合预期（进程树清理能覆盖子进程/孙进程）。
  - macOS/Linux：确认 SIGKILL 权限与清理效果（无僵尸进程残留）。
- **产物完整性与体积检查**
  - 校验 `app.asar`/resources 资源完整（tray icon、preload/main/renderer bundle、schema.sql 等）。
  - 输出最终安装包体积（与上个版本对比）；若体积异常增长，定位原因（例如日志/调试符号/重复依赖）。

## 2. 关键回归清单（E2E 核心路径）

- **数据流主链路**
  - 任务提交 → `queued/running` → stdout/stderr 落盘 → SQLite tasks 状态更新 → ReportsPage 展示 → ReportPage 懒加载归档日志 → 导出日志成功。
  - 验证点：
    - 队列并发上限为 2；第 3 个任务进入 queued 且退出后自动唤醒。
    - `<userData>/logs/<runId>.log` 实时追加，重启后仍可读取。
    - SQLite tasks 表 `start_time/end_time/duration/exit_code/status` 字段完整。
- **窗口/托盘/通知生命周期**
  - 最小化/关闭 → 隐藏到托盘 → 任务结束通知弹出 → 点击通知恢复窗口并跳转 `/report/:runId`。
  - 验证点：
    - Notification click → show+focus → app:navigate 路由跳转。
    - Tray 左键策略（menu/toggle/none）热更新即时生效。
- **并发安全/压力测试**
  - 连续提交 10 个任务（可用 mock 脚本快速退出或 sleep），观察：
    - 队列顺序稳定，无丢任务、无重复启动。
    - 内存稳定（日志视图虚拟滚动不爆内存；ReportPage 分块读取不拉全量）。
    - SQLite busy 重试生效（无大量 `database is locked` 导致任务状态缺失）。

## 3. 风险点与回滚策略

- **数据库损坏/异常（恢复策略）**
  - 出现 `omniscraper.db` 打不开或 WAL/SHM 异常时：
    - 先尝试只读模式启动（验证只读降级生效：可查看历史/日志但不可保存模板/不可写状态）。
    - 应急恢复手段（人工操作）：
      - 备份原库：复制 `omniscraper.db`、`omniscraper.db-wal`、`omniscraper.db-shm` 到安全位置。
      - 尝试清理 WAL/SHM 后重启（仅在确认数据可接受丢失时）。
- **锁重试失败后的体验降级**
  - 若 `runWithRetry` 仍失败：
    - UI 侧保持可读（Reports/KB 可读取），写操作失败以 RetryButton 暴露重试入口。
    - 必要时触发只读提示（warning notify），避免用户误以为“保存成功”。
- **版本升级迁移预案（未来可能需要）**
  - 当前策略为“无需迁移”；若未来需要从旧 JSON/Store 迁移到 SQLite：
    - 提供一次性迁移脚本（读取旧数据写入 tasks/configs），执行成功后写入 `migration_version` 标记防止重复迁移。
    - 迁移失败时不阻塞启动（仍可只读运行），并给出明确提示与日志。

## 4. 开发者体验（DX）

- **dev vs build 一致性**
  - `npm run dev` 与 `npm run build && npm run preview` 行为一致（IPC 通道、preload 暴露、数据库路径、日志路径一致）。
  - 建议增加一个最小 smoke：build 后启动执行一次“创建任务→取消→查看历史→打开报告”。
- **调试与诊断**
  - 提供可控的 debug 开关（例如 env `APP_DEBUG=1`）：
    - 输出 JobQueue 状态变更日志（含 throttle 推送）
    - 输出 DB readonly 状态与 busy 重试次数统计
  - Crash/错误收集预留（不要求立刻接入三方）：
    - 统一错误上报入口（主进程捕获 unhandledRejection/uncaughtException；renderer 捕获 window.onerror）。
    - 写入 `<userData>/crash/` 或 `<userData>/logs/app.log` 便于用户提交问题。

---

## 最小发布门禁（建议）

- `npm test` ✅
- `npm run typecheck` ✅
- 本地 E2E 回归（第 2 节三条主链路）✅
- 打包产物冷启动自检（DB 最小读写 + 归档日志读取）✅

