# Crash 报告指南（Desktop / Electron）

当桌面端（Electron）主进程或渲染进程发生未捕获异常时，应用会自动在本机落盘一份 JSON 格式的 crash 报告，便于排查问题。

## 1. 报告生成位置

Crash 报告会写入：

`<userData>/crash/*.json`

其中 `<userData>` 对应 Electron 的 `app.getPath('userData')`。

常见默认路径（以实际为准）：

- macOS：`~/Library/Application Support/<AppName>/`
- Windows：`%APPDATA%\\<AppName>\\`
- Linux：`~/.config/<AppName>/`

## 2. 报告内容结构

每个文件是一条 JSON 记录，核心字段：

- `schemaVersion`：结构版本（当前为 `1`）
- `ts`：时间戳（毫秒）
- `processType`：`main` 或 `renderer`
- `eventType`：
  - 主进程：`uncaughtException` / `unhandledRejection`
  - 渲染进程：`rendererError` / `rendererUnhandledRejection`
- `error`：错误信息（`name/message/stack`）
- `details`：补充信息（例如渲染进程 error 的 `filename/lineno/colno` 或 rejection 的 `reasonType`）
- `context.lastRunId`：崩溃发生时应用记录的最后一个运行 ID（用于关联任务运行上下文）
- `system`：平台与版本信息（`platform/arch/electron/chrome/node`）

## 3. 安全与隐私说明

- Crash 报告不会主动采集或写入 `process.env`、令牌、Cookie 等环境/敏感信息。
- 建议在提交给他人前快速检查 `error.message/stack/details` 中是否包含敏感数据（例如你手动粘贴到输入框里的密钥）。

## 4. 如何提交给开发者

1. 找到最新的 `*.json` 文件（文件名带时间戳）。
2. 作为附件提交到 issue 或发送给维护者。
3. 同时附上你当时的操作步骤，以及 `context.lastRunId` 对应的任务是否正在运行/已完成。

## 5. 清理方式

如需清理 crash 历史记录，删除 `<userData>/crash/` 目录下的文件即可。

