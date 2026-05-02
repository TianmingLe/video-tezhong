# OmniScraper Pro（视频特种）报错修复手册（Troubleshooting）

> 本文分为两部分：
> - **A. 用户侧排障**：安装/运行/任务失败时你应该怎么做
> - **B. 维护者/开发侧排障**：CI、Nightly、Release 流水线失败时怎么修

---

## A. 用户侧排障

### A1. Windows 安装器无法运行（SmartScreen）

**现象**
- 双击 `.exe` 后提示“Windows 已保护你的电脑”

**处理**
- 点击“更多信息”→“仍要运行”

---

### A2. macOS 无法打开（Gatekeeper）

**现象**
- 提示“无法验证开发者/来自未知开发者”

**处理**
- 系统设置 → 隐私与安全 → 允许打开

---

### A3. Linux AppImage 无法运行

**现象**
- 双击没反应 / 提示权限不足

**处理**

```bash
chmod +x OmniScraper*.AppImage
./OmniScraper*.AppImage
```

---

### A4. Python 环境检测失败

**现象**
- Onboarding 提示找不到 Python 或检测失败

**处理**
- Windows：

```powershell
python --version
where.exe python
```

- macOS/Linux：

```bash
python3 --version
which python3
```

如果命令不存在：
- Windows：安装 Python 并勾选 “Add Python to PATH”
- macOS：建议安装 Python3（或通过 Homebrew）
- Linux：使用系统包管理器安装 python3

---

### A5. 任务运行失败（exitCode 非 0）

**现象**
- Run 最终状态 failed
- exitCode 非 0

**处理（按优先级）**
- 在 Reports/任务详情导出 `.log`，从日志最后 50 行定位错误
- 若是文件权限/路径错误：
  - 改用英文路径或短路径
  - 确保输出目录可写
- 若是网络错误：
  - 检查代理/防火墙
  - 重试并观察是否是偶发

**反馈给维护者时请提供**
- RunID
- 导出的 `.log`
- 你的系统与版本（Windows 11 / macOS 14 / Ubuntu 22.04 等）

---

### A6. 应用卡死/无响应

**处理**
- 先等待 30 秒（某些 I/O 可能阻塞）
- 尝试从托盘退出并重启
- 如果频繁出现：
  - 导出日志
  - 提供发生卡死前你做的操作步骤

---

### A7. 托盘不显示或托盘菜单异常

**处理**
- Windows：确认任务栏“隐藏的图标”区域是否被折叠
- macOS：检查菜单栏右上角
- Linux：不同桌面环境托盘支持不同，建议优先使用主窗口功能；必要时升级桌面环境或使用支持 StatusNotifier 的托盘扩展

---

### A8. 更新后功能没变化

**原因**
- 你可能下载了旧的安装包，或者安装路径存在多个版本

**处理**
- Nightly：重新从 nightly 入口下载最新包，优先按文件名中的短 hash 对照“最新一次 main 提交”
- v*：需要下载更高版本号的 release（beta.3 → beta.4 / 0.0.2 等）

---

### A9. Windows 应用内卸载失败

**现象**
- 设置页点击“卸载应用”后提示启动失败

**处理**
- 使用系统卸载兜底：Windows 设置 → 应用 → 卸载
- 如果你需要定位原因，请提供：
  - 错误提示截图
  - （如可导出）日志

---

## B. 维护者/开发侧排障（CI / Nightly / Release）

### B1. Nightly 构建失败：`Cannot read properties of null (reading 'provider')`

**现象**
- electron-builder 在 publish/updateInfo 阶段报错 provider 为 null

**根因**
- 在子目录（`desktop/`）打包时无法从 `.git/config` 推断仓库信息

**修复**
- 在 [desktop/package.json](file:///workspace/desktop/package.json) 添加 `repository` 字段：
  - `type=url=https://github.com/<org>/<repo>.git`
  - `directory=desktop`

---

### B2. Windows CI 单测失败：`EBUSY ... unlink *.db`

**现象**
- Windows runner 上删除 sqlite 临时文件失败

**根因**
- `better-sqlite3` db 未关闭导致文件锁定

**修复**
- 在测试里确保 `db.close()` 后再 `unlink`，并对清理做容错：
  - [tasksRepo.test.ts](file:///workspace/desktop/electron/main/db/tasksRepo.test.ts)
  - [configsRepo.test.ts](file:///workspace/desktop/electron/main/db/configsRepo.test.ts)
  - [index.test.ts](file:///workspace/desktop/electron/main/db/index.test.ts)

---

### B3. Nightly 发布失败：上传了不该上传的内部文件（如 `PkgInfo`）

**现象**
- `gh release upload` 过程中出现 404/异常

**根因**
- `desktop/release/` 里包含 `.app` 目录内部文件等中间产物，不应作为 Release asset 上传

**修复**
- 在 [nightly.yml](file:///workspace/.github/workflows/nightly.yml) 里只上传可分发文件：
  - `*.exe`、`*.dmg`、`*.AppImage`、`latest*.yml`、`*.blockmap`

---

### B4. 本地复现 CI 门禁（desktop）

在仓库根目录执行：

```bash
cd desktop
npm ci --no-audit --no-fund
npm test
npm run typecheck
```

---

### B5. 发布策略建议

- **Nightly**：用于持续交付与内部快速验证（滚动更新，不保留历史）。
- **v* Release**：用于阶段性里程碑与对外发版（保留历史版本，便于回滚）。

