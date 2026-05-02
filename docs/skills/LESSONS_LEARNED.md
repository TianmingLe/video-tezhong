# 本次开发经验与问题教训（重点）

> 目标：沉淀可复用的工程经验，避免在“桌面端 + CI/CD + 打包发布 + 跨平台”场景中重复踩坑。

## 目录

- 1. 项目结构与范围管理
- 2. 分支/PR/合并：如何避免“以为合并了但其实没合并”
- 3. CI 与本地差异：为什么本地 PASS，CI 会 FAIL
- 4. Electron 主进程/渲染进程边界：典型坑与修复方式
- 5. SQLite（better-sqlite3）与跨平台文件锁
- 6. 打包发布（electron-builder）：仓库信息、schema.sql、原生依赖
- 7. Nightly（滚动发布）机制：正确的产物与上传策略
- 8. Windows 一键卸载：实现策略与注意事项
- 9. 文档与验收：把“能跑”变成“可交付”
- 10. 推荐的长期改进清单（可选但收益高）
- 附：关键问题速查

---

## 1. 项目结构与范围管理

### 1.1 事实：仓库包含两套“产品线”

- **MediaCrawler（CLI/Python pipeline）**：`/workspace/MediaCrawler`
- **Desktop（Electron 桌面端）**：`/workspace/desktop`

### 1.2 教训（重点）

- README 若只写其中一套，会导致使用者误解“项目到底怎么用”。
- 同一个仓库里出现多套产品线时，必须明确：
  - 哪个是对外交付形态（安装包）
  - 哪个是底层能力（CLI/pipeline）
  - 二者如何复用（未来规划/当前是否打通）

### 1.3 落地建议

- README 顶部明确“我该下载哪个包 / 从哪里下载”
- 桌面端提供独立用户手册与排障手册，避免信息散落在 PR/聊天记录里

---

## 2. 分支/PR/合并：如何避免“以为合并了但其实没合并”

### 2.1 经验

- 最终产品分支应明确为 `main`。
- 功能开发/验收应在 feature 分支进行，通过 PR 合并进入 `main`。

### 2.2 教训（重点）

- “本地门禁 PASS”不等于“GitHub Checks PASS”。
- “push 了代码”不等于“已经合并到 main”，尤其在多次修复 CI 的情况下，容易误判状态。

### 2.3 建议 SOP（可复用）

- 合并前：
  - PR Checks 全绿
  - PR base=main，compare=feature
- 合并后：
  - 在 main 上确认包含关键提交（GitHub commits 或 `git log --oneline -n 20`）

---

## 3. CI 与本地差异：为什么本地 PASS，CI 会 FAIL

### 3.1 事故：`navigator is not defined`

**表现**

- CI 跑单测时（Node 环境）报 `ReferenceError: navigator is not defined`

**根因**

- 代码默认访问 `navigator.clipboard`，但 Node 环境无 `navigator`

**经验规则（重点）**

- 任何 Browser API 都必须加环境保护：
  - `typeof navigator !== 'undefined'`
  - 或通过依赖注入把真实实现隔离在浏览器侧

### 3.2 事故：CI 下打包/运行对原生依赖更敏感

**表现**

- Linux headless 环境下，原生模块（例如 `better-sqlite3`）可能需要额外 rebuild
- Electron 与 Node 的 ABI 不一致会导致“某些测试/某些 e2e 能跑、另一些会挂”

**经验规则（重点）**

- CI 的 E2E/打包步骤要显式处理：
  - Electron 侧 install-app-deps / rebuild
  - Node 侧依赖的复原（避免影响 vitest）

---

## 4. Electron 主进程/渲染进程边界：典型坑与修复方式

### 4.1 教训（重点）：不要在测试里强依赖 Electron App 实例

- main 侧逻辑如果在纯单测路径就 import Electron，测试环境会变得不稳定、难以 mock。

### 4.2 经验：纯函数 + 动态 import 分层

- 纯函数：解析/选择策略（可单测）
- 副作用：真正执行系统调用时再 `await import('electron')` 获取 `app`

---

## 5. SQLite（better-sqlite3）与跨平台文件锁

### 5.1 事故：Windows CI `EBUSY unlink *.db`

**报错形态**

- `EBUSY: resource busy or locked, unlink ... .db`

**根因**

- Windows 下 sqlite 文件在 DB 未关闭时会被锁定
- 测试在 `afterEach` 直接 `unlink` 临时文件，未先 `db.close()`

**经验规则（重点）**

- 对所有 sqlite 测试：**先 close，再删文件**
- 清理逻辑要容错（避免二次失败覆盖真实原因；同时确保不污染后续测试）

---

## 6. 打包发布（electron-builder）：仓库信息、schema.sql、原生依赖

### 6.1 事故：`Cannot read properties of null (reading 'provider')`

**根因**

- 在 `desktop/` 子目录内执行 electron-builder，无法从 `.git/config` 推断仓库 provider

**修复**

- 在 `desktop/package.json` 增加 `repository` 字段（包含 `directory: "desktop"`）

### 6.2 事故：main build 产物缺失 `schema.sql`

**表现**

- 运行时读取 `dist/main/schema.sql` 失败或在 pack 后丢失

**经验规则（重点）**

- “运行时依赖文件”必须进入 build/pack 产物
- 构建管道要显式 copy/打包（不要依赖隐式行为）

### 6.3 兼容性：electron-updater 在 ESM 下的导入形态

- ESM/tsconfig 环境下，有些包需要 `default import` 形式，否则运行时会报错。

---

## 7. Nightly（滚动发布）机制：正确的产物与上传策略

### 7.1 教训（重点）：Nightly 解决“持续交付”，不是“堆版本”

- 用户永远只记一个入口（`nightly`）
- main 更新并通过门禁就出新包

### 7.2 事故：Nightly 发布失败（上传 `.app` 内部文件如 `PkgInfo`）

**根因**

- 上传策略过宽：把 `desktop/release/**` 里所有文件当作 Release assets

**经验规则（重点）**

- Release 只上传“可分发文件”：
  - `*.exe`、`*.dmg`、`*.AppImage`、`latest*.yml`、`*.blockmap`

### 7.3 经验：更新 Nightly Release 的最稳做法

- 删除并重建 `nightly` release，再上传最新资产
- 避免 edit 参数兼容性、旧资产残留等问题

---

## 8. Windows 一键卸载：实现策略与注意事项

### 8.1 用户体验要求（重点）

- 必须二次确认
- 确认后拉起卸载器并退出应用
- 失败要可读错误提示，并提供系统卸载兜底路径

### 8.2 技术要点

- 优先从安装目录寻找卸载器（常见 NSIS 命名）
- 注册表兜底读取 `UninstallString`
- detached spawn 拉起卸载器，避免被当前进程生命周期影响

---

## 9. 文档与验收：把“能跑”变成“可交付”

### 9.1 教训（重点）

- 没有验收记录与运行手册，交付会陷入“你说能用，但我这边不行”的沟通消耗。

### 9.2 经验（已落地）

- 用户手册：安装/更新/卸载/核心功能/数据位置
- 排障手册：用户侧 + 维护者侧（CI/Nightly/Release）
- Release Runbook：把发布做成 SOP（命令、断言、回滚点）
- 最终验收记录：把“门禁全绿”变成可审计文档

---

## 10. 推荐的长期改进清单（可选但收益高）

### 10.1 版本策略（SemVer）

- nightly：永远最新
- beta：阶段性可用（v0.0.1-beta.N）
- stable：稳定对外（v0.1.0 / v1.0.0）

### 10.2 签名与可信分发

- Windows：代码签名证书（减少 SmartScreen）
- macOS：签名 + notarization（减少 Gatekeeper）

### 10.3 发布可观测性

- nightly release notes 自动包含 commit hash / 近期变更摘要
- CI 失败自动在 PR/commit 上提示“可操作的修复建议”

---

## 附：关键问题速查

- `navigator is not defined`：Node 测试环境访问浏览器 API → 加 `typeof navigator !== 'undefined'`
- `EBUSY unlink *.db`：Windows 文件锁 → `db.close()` 后再删文件
- `provider is null`：electron-builder 推断仓库失败 → `desktop/package.json` 补 `repository`
- `schema.sql` 丢失：运行时依赖文件未进产物 → build 后显式 copy/打包
- Nightly 上传失败：上传了 `.app` 内部文件 → 只上传 `.exe/.dmg/.AppImage/.yml/.blockmap`

