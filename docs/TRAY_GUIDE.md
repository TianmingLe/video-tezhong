# Tray Guide（托盘行为 + 配置 + 验证）

本文档说明 Desktop 端托盘（Tray）的默认行为、配置文件 `tray-config.json` 的位置与字段，以及本地/CI 的验证方式与常见排查。

## 1. 默认行为（跨平台）

托盘逻辑位于主进程 [TrayController.ts](file:///workspace/desktop/electron/main/tray/TrayController.ts)。

- macOS（darwin）
  - 左键：默认弹出菜单（menu）
  - 右键：弹出菜单（menu）
  - Dock/窗口：窗口关闭默认不退出（隐藏到托盘/Dock 行为受 Electron 平台策略影响）
- Windows / Linux
  - 左键：默认显示/隐藏窗口（toggle）
  - 右键：弹出菜单（menu）
  - 窗口关闭：默认拦截 close 并隐藏到托盘（见 [index.ts](file:///workspace/desktop/electron/main/index.ts) 中非 darwin 的 close 逻辑）

备注：默认值由 [trayConfig.ts](file:///workspace/desktop/electron/main/tray/trayConfig.ts) 的 `getDefaultTrayConfig(platform)` 定义。

## 2. 配置文件：tray-config.json

### 2.1 文件位置

配置文件路径由 [trayConfig.ts](file:///workspace/desktop/electron/main/tray/trayConfig.ts) 的 `getTrayConfigFilePath(userDataPath)` 计算：

```
<userDataPath>/tray-config.json
```

其中 `<userDataPath>` 等同于 Electron `app.getPath('userData')`，常见位置参考：

- macOS：`~/Library/Application Support/desktop/tray-config.json`
- Windows：`%APPDATA%\\desktop\\tray-config.json`
- Linux：`~/.config/desktop/tray-config.json`

### 2.2 字段说明

文件内容为 JSON（可包含部分字段，缺失字段会回落到默认值）：

- `leftClick`：托盘左键行为
  - `menu`：弹出菜单
  - `toggle`：显示/隐藏窗口
  - `none`：不处理
- `rightClick`：托盘右键行为
  - `menu`：弹出菜单
  - `none`：不处理
- `showBadgeOnRunning`：运行中徽标（仅部分平台支持 `tray.setTitle` 的情况下生效）
  - `true`：运行中显示 `●`
  - `false`：不显示

示例：

```json
{
  "leftClick": "toggle",
  "rightClick": "menu",
  "showBadgeOnRunning": false
}
```

### 2.3 修改方式

- 应用内：设置页会读取/更新托盘配置（见 [SettingsPage.tsx](file:///workspace/desktop/electron/renderer/src/pages/SettingsPage.tsx)）
- 手工编辑：修改 `tray-config.json` 后重启应用（或触发重新加载配置的入口）以确保状态一致

## 3. 通知与跳转（概览）

任务结束/失败后会构建系统通知（见 [notification.ts](file:///workspace/desktop/electron/main/tray/notification.ts) 的 `buildNotificationPayload`），并在用户点击通知后：

- 拉起并聚焦窗口
- 通过 `webContents.send('app:navigate', { path })` 触发前端路由跳转到 `/report/<runId>`

该逻辑目前位于主进程 [index.ts](file:///workspace/desktop/electron/main/index.ts) 的 `processManager.onExit/onError` 回调中。

## 4. 验证方式（本地 & CI）

### 4.1 本地一键验证

仓库根目录：

```bash
make verify-tray
```

它会调用 [verify-tray-flow.sh](file:///workspace/desktop/scripts/verify-tray-flow.sh)：

- 默认优先运行 `electron/main/notify/notifyFlow.test.ts`（如果该集成测试已存在）
- 若不存在则回退运行 `electron/main/tray` 下的单元测试

### 4.2 CI（Linux）

GitHub Actions 的 Linux job 会：

- 安装 Desktop 依赖（`npm ci`，非交互）
- 执行 `npm test`、`npm run typecheck`
- 执行 `make verify-tray`（复用本地脚本）

## 5. FAQ / 排查

### 5.1 托盘图标不显示

- 确认应用启动后未直接退出（Windows/Linux 默认 close 会 hide，不会 quit）
- 若为打包产物，确认资源路径与图标候选路径（见 [trayIcon.ts](file:///workspace/desktop/electron/main/tray/trayIcon.ts)）在当前环境存在

### 5.2 点击托盘无反应

- 检查 `tray-config.json` 的 `leftClick/rightClick` 是否设置为 `none`
- 在应用内设置页将左键行为改回 `menu/toggle`

### 5.3 macOS 通知不响 / 静音

`buildNotificationPayload` 在 darwin 默认 `silent: true`（见 [notification.ts](file:///workspace/desktop/electron/main/tray/notification.ts)），这是为了避免 CI/开发环境下的干扰；如需声音提示可在实现层调整该策略。

