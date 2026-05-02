# OmniScraper Pro（视频特种）用户手册

> 本手册面向“直接使用桌面应用的用户”，覆盖安装、首次使用、核心功能、数据存储、更新与卸载、常见问题处理。

## 1. 产品概览

OmniScraper Pro 是一个桌面端工具，用于将采集/分析任务以“Run（运行实例）”的方式提交到任务队列执行，并在完成后查看报告与导出日志。

你会经常看到以下概念：

- **Run / RunID**：一次任务运行的唯一标识（用于日志与报告定位）。
- **任务队列**：控制并发执行与排队。
- **知识库（Knowledge Base / KB）**：用于存储/选择不同配置（例如不同平台/不同抓取策略）。
- **日志**：每个 Run 会产生日志，可实时查看或导出。

---

## 2. 下载与安装

### 2.1 获取安装包（推荐）

我们提供两种下载方式：

- **Nightly（持续更新）**：每次 main 更新并通过门禁后，自动发布最新安装包。适合你想“永远使用最新版本”。
  - 下载入口：`https://github.com/TianmingLe/video-tezhong/releases/tag/nightly`
- **版本化 Release（v*）**：例如 `v0.0.1-beta.3`，对应某次固定快照。适合稳定复现与回滚。
  - 下载入口：`https://github.com/TianmingLe/video-tezhong/releases`

### 2.2 Windows 安装（.exe）

- 下载 `.exe` 后双击安装。
- 若出现 SmartScreen：
  - 点击“更多信息”→“仍要运行”。

### 2.3 macOS 安装（.dmg）

- 下载 `.dmg` 双击打开，将应用拖拽到 Applications。
- 若出现“无法打开/来自未知开发者”：
  - 系统设置 → 隐私与安全 → 允许打开。

### 2.4 Linux 运行（.AppImage）

- 下载 `.AppImage`。
- 若无法运行，先赋予可执行权限：

```bash
chmod +x OmniScraper*.AppImage
./OmniScraper*.AppImage
```

---

## 3. 首次启动（Onboarding）

首次启动会进行环境检测与基础配置读取，常见流程：

1. 检测 Python 是否可用（某些任务依赖 Python 执行）。
2. 读取/初始化本地数据库（用于记录 Run、配置与历史）。
3. 加载托盘与基础设置。

### 3.1 Python 环境检测

- Windows：打开 PowerShell，确认：

```powershell
python --version
```

- macOS/Linux：确认：

```bash
python3 --version
```

如果检测失败，请先参考 [TROUBLESHOOTING.md](file:///workspace/docs/TROUBLESHOOTING.md) 的“Python 检测失败”章节。

---

## 4. 页面导览

应用通常包含以下核心页面/模块：

### 4.1 任务（Tasks）

用于创建/提交任务，并查看队列状态与每个 Run 的执行结果。

常见动作：

- 新建并提交任务
- 查看排队/运行中/已完成状态
- 取消运行中的任务（如支持）

### 4.2 报告（Reports）

用于查看历史 Run 的报告结果与导出日志。

常见动作：

- 打开某个 Run 的详情
- 导出完整日志（.log）

### 4.3 设置（Settings）

用于管理托盘行为、日志清理、更新、性能信息、反馈问题、卸载（Windows）等。

---

## 5. 任务（Tasks）使用说明

### 5.1 提交任务

一般流程：

1. 在任务页面选择或填写参数（例如输入源、输出目录、并发、过滤条件等）。
2. 点击“开始/提交”生成 Run。
3. Run 进入队列：
   - 若并发未满：状态为 running
   - 若并发已满：状态为 queued

### 5.2 查看运行状态

你可以从 UI 中看到：

- queued：排队中
- running：运行中
- succeeded/failed：完成（成功/失败）
- exitCode：进程退出码（用于判断失败原因）

### 5.3 导出日志

进入 Reports 或任务详情，点击“导出完整日志（.log）”。

导出日志用于：

- 你自己复盘某次 Run 的执行过程
- 向维护者反馈问题（可以直接提供日志文件）

---

## 6. 托盘（Tray）

托盘用于后台运行与快捷操作。常见行为：

- 左键点击：打开菜单或切换显示（取决于设置）
- 右键点击：弹出菜单

更详细说明见 [TRAY_GUIDE.md](file:///workspace/docs/TRAY_GUIDE.md)。

---

## 7. 更新（Update）

### 7.1 Nightly 更新方式

Nightly 是“滚动更新”，每次发布会覆盖 `nightly` 的安装包文件。

你想更新到最新版本时：

- 重新下载 nightly 安装包覆盖安装（或先卸载再安装）

### 7.2 版本化 Release 更新方式（v*）

当你需要固定版本（例如 beta.3）：

- 下载对应版本安装包并安装

---

## 8. 卸载（Uninstall）

### 8.1 Windows：应用内一键卸载（推荐）

- 设置 → 卸载 → 点击“卸载应用”
- 二次确认后，会启动卸载程序并退出应用

### 8.2 系统卸载（所有平台通用兜底）

- Windows：设置 → 应用 → 已安装的应用 → 卸载
- macOS：Applications 删除应用（或用你安装时的工具卸载）
- Linux：删除 AppImage 文件即可（若有桌面快捷方式需同时删除）

---

## 9. 数据与文件位置（重要）

应用会在本地用户目录写入以下数据：

- **数据库**：`<userData>/omniscraper.db`
- **运行日志**：`<userData>/logs/<runId>.log`
- **崩溃信息**：`<userData>/crash-reports/`（如开启）
- **托盘配置**：`<userData>/tray-config.json`（如存在）

`<userData>` 在不同系统下不同，常见位置参考：

- Windows：`%APPDATA%/<AppName>/` 或 `%LOCALAPPDATA%/<AppName>/`
- macOS：`~/Library/Application Support/<AppName>/`
- Linux：`~/.config/<AppName>/`

当你反馈问题时，建议提供：

- RunID
- 对应 `.log`
- （如有）崩溃报告与截图

---

## 10. 反馈问题（推荐做法）

当你遇到问题，建议按以下顺序提供信息：

1. 描述你做了什么（步骤）
2. 期望结果是什么
3. 实际发生了什么（截图/提示）
4. RunID 与日志导出文件

如果应用提供“反馈/打包诊断信息”功能，优先使用它生成可复现信息包。

---

## 11. 常见问题（FAQ）

### 11.1 Python 检测失败

请先确认你的系统可直接运行 `python`（Windows）或 `python3`（macOS/Linux）。更详细见 [TROUBLESHOOTING.md](file:///workspace/docs/TROUBLESHOOTING.md)。

### 11.2 托盘不显示

见 [TROUBLESHOOTING.md](file:///workspace/docs/TROUBLESHOOTING.md) 的“托盘相关”章节。

### 11.3 更新后功能不一致

如果你使用的是 nightly：

- nightly 是滚动更新，请确保你下载的是 latest 的 nightly 安装包（可对照文件名中的短 hash）

如果你使用的是 v*：

- 版本化 release 固定不变，需要更新到新的 tag 才会有新功能

