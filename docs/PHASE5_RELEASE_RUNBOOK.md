# Phase 5 Release Runbook（SOP）

> 聚焦“可执行、可审计”。每一步都给出命令、断言、回滚点与环境差异提示。

## 0. 约定与变量

- **工作目录**：仓库根目录 `/workspace`（本地请替换为你的路径）
- **Desktop 目录**：`./desktop`
- **关键路径**
  - DB：`<userData>/omniscraper.db`
  - Logs：`<userData>/logs/<runId>.log`
- **环境标记**
  - Local Dev：开发机（可 GUI）
  - CI Runner：无 GUI，必须禁用 Electron 二进制下载
    - `ELECTRON_SKIP_BINARY_DOWNLOAD=1`

---

## 1) Pre-flight（发布前准备）

### 1.1 版本与工作区干净

- 命令：

```bash
git status --porcelain
```

- 断言：
  - 输出为空（无未提交改动）
- 回滚点：
  - 若有改动：`git restore . && git clean -fd`

### 1.2 Node/构建工具链确认

- Local Dev 命令：

```bash
node -v
npm -v
```

- 断言：
  - Node 版本与团队约定一致（建议 Node 20 LTS）

### 1.3 原生依赖预检（better-sqlite3）

- Local Dev 命令：

```bash
cd desktop
npm ci --no-audit --no-fund
node -e "require('better-sqlite3'); console.log('better-sqlite3:OK')"
```

- CI Runner 命令：

```bash
cd desktop
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --no-audit --no-fund
node -e "require('better-sqlite3'); console.log('better-sqlite3:OK')"
```

- 断言：
  - `better-sqlite3:OK`
  - exit code = 0
- 回滚/停止条件：
  - 若 require 失败：停止发布，先修复 node-gyp / MSVC / Xcode CLT / python 等编译依赖

### 1.4 单测与类型门禁（必须）

- 命令：

```bash
cd desktop
npm test
npm run typecheck
```

- 断言：
  - `npm test` 全绿，exit code = 0（当前基线应为 **61/61**）
  - `npm run typecheck` exit code = 0
- 回滚点：
  - 门禁失败一律停止；只允许修复后重新执行

---

## 2) Build & Package（构建与打包）

### 2.1 构建（electron-vite）

- 命令：

```bash
cd desktop
npm run build
```

- 断言：
  - exit code = 0
  - `desktop/dist/` 生成且包含 main/renderer/preload bundle
- 回滚点：
  - build 失败停止；不要进入后续 verification

### 2.2 原生依赖打包检查（.node 文件）

- 命令（示例，按实际产物路径调整）：

```bash
cd desktop
find dist -name "*.node" -maxdepth 6 | head -n 20
```

- 断言：
  - 能找到 `better_sqlite3.node`（或对应平台命名的 `.node` 文件）
- 停止条件：
  - 未找到 `.node`：停止发布，修复打包策略（asarUnpack / externalize / electron-vite native deps 配置）

### 2.3 产物体积（审计项）

- 命令：

```bash
cd desktop
du -sh dist
```

- 断言：
  - 体积与上个稳定版本同数量级；若异常增长，必须解释原因并记录到 release notes

---

## 3) Verification（发布前验证）

> 建议在“打包产物环境”下验证，而非仅 dev server。

### 3.1 冷启动自检（DB 建表 + 最小写入）

- Local Dev（GUI）：
  - 启动应用后，执行一次“启动任务/保存模板”的最小动作
  - 确认没有只读告警（除非你刻意模拟权限问题）
- 断言：
  - `<userData>/omniscraper.db` 存在
  - ReportsPage 能看到 tasks 记录

### 3.2 JobQueue 并发回归（关键）

- 操作（GUI）：
  - 连续提交 3 个长耗时任务
- 断言：
  - QueueStatusCard 显示 `Running: 2/2`
  - 第 3 个任务进入 queued（Pending >= 1）
  - 前 2 个任一退出后，第 3 个自动开始
- 回滚/停止条件：
  - 出现“丢任务/重复启动/卡死”立即停止发布

### 3.3 日志落盘与导出（关键）

- 操作：
  - 运行任意任务，等待输出日志
  - 进入 ReportPage
  - 点击“导出完整日志”
- 断言：
  - `<userData>/logs/<runId>.log` 存在且持续追加
  - ReportPage 刷新/重启后仍可通过归档日志懒加载显示
  - 导出对话框保存成功，文件内容与归档日志一致

### 3.4 托盘/通知/跳转（关键）

- 操作：
  - 最小化/关闭到托盘
  - 等任务结束触发系统通知
  - 点击通知
- 断言：
  - 窗口恢复并聚焦
  - 自动跳转 `/report/:runId`

### 3.5 SQLite 锁重试与只读降级（演练）

- 锁重试演练（建议在 debug build 或开发机演练）：
  - 并发启动多个任务，观察是否出现大量 `database is locked`
  - 断言：短暂锁冲突不会导致状态丢失（最终 tasks 状态完整）
- 只读降级演练（本地）：
  - 临时把 `<userData>` 目录权限改为只读（或模拟磁盘满）
  - 启动应用
  - 断言：
    - 应用可启动（readonly fallback）
    - UI 出现 warning notify
    - “保存为模板/设为默认”等写操作按钮 disabled 且有 title 提示

---

## 4) Release（发布执行）

### 4.1 打 tag / 记录构建元信息

- 命令（示例，按团队规范调整）：

```bash
git tag -a "desktop-phase5-<version>" -m "Phase5 release"
git push --tags
```

- 断言：
  - tag 推送成功
- 回滚点：
  - 若发现严重缺陷：删除 tag 并停止
    - `git tag -d <tag> && git push origin :refs/tags/<tag>`

### 4.2 产物签名/发布（如有）

- 按团队渠道（GitHub Releases / 内部制品库）上传产物
- 断言：
  - 校验下载产物可运行

---

## 5) Post-flight（发布后跟踪）

### 5.1 运行时指标与日志采集

- 检查 `<userData>/logs/` 是否持续写入
- 检查是否出现频繁只读告警或重试失败告警（如有则回滚或紧急修复）

### 5.2 回滚预案（最低可执行）

- 保留上一个稳定版本安装包/可执行文件
- 若出现 P0（启动失败/任务不可执行/数据损坏）：
  1. 停止分发新版本
  2. 回滚到上一个稳定版本
  3. 收集 `<userData>/omniscraper.db*` 与 `<userData>/logs/` 作为问题样本

