# Windows 一键卸载（Design）

## 目标

在 Windows 安装包版本中提供“应用内一键卸载”能力：用户在设置页点击按钮后二次确认，随后启动卸载程序并退出应用。

## 范围

### 支持平台

- 仅 Windows（`process.platform === 'win32'`）
- 其他平台：不展示入口；若被调用则返回错误

### 入口

- Settings 页面提供按钮「卸载应用」（Windows-only）

### 交互

1. 用户点击「卸载应用」
2. 弹出确认框，提示“将启动卸载程序并退出应用”
3. 用户确认后：
   - 主进程解析并启动卸载器（交互模式）
   - 主进程触发 `app.quit()` 退出应用
4. 若失败（未找到卸载器/启动失败/权限等）：不退出应用，返回错误并在 UI 里提示

## 技术方案

### IPC & API

- IPC channel：`app:uninstall`
- Preload API：`window.api.app.uninstall(): Promise<{ success: true } | { success: false; error: string }>`

### 卸载器定位策略（按优先级）

1. **安装目录推导（优先）**
   - 基于 `app.getPath('exe')` 获取当前可执行文件所在目录
   - 在同目录尝试常见 NSIS 卸载器命名：
     - `Uninstall ${productName}.exe`
     - `Uninstall.exe`
     - `uninstall.exe`
2. **注册表兜底**
   - 查询 `HKCU` 与 `HKLM` 的卸载项：
     - `Software\Microsoft\Windows\CurrentVersion\Uninstall`
   - 通过 `DisplayName == productName` 过滤出目标项
   - 读取 `UninstallString` 并解析为 `command + args`

### 进程启动

- 用 `child_process.spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false })`
- 对无法解析为明确可执行文件路径的 `UninstallString`，使用 `cmd.exe /c <uninstallString>` 兜底

### 安全与 UX 约束

- 强制二次确认，避免误触
- 不静默卸载（交互模式），由用户在卸载器里完成最终确认
- 仅在 Windows 下启用，避免跨平台行为不一致

## 验收标准

- Windows 上 Settings 出现「卸载应用」按钮
- 点击后出现确认框
- 确认后能够拉起卸载器并退出应用
- 失败时有可读错误提示（toast），且应用不退出
- 单测覆盖纯函数：
  - 安装目录候选卸载器选择
  - `UninstallString` 解析（含引号/带参数）
  - `reg query` 输出解析（DisplayName + UninstallString）

