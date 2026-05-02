# Nightly 自动打包发布（Design）

## 目标

实现“每次 main 有新提交并通过门禁后，自动产出可下载的安装包”的发布流程，用户只需要进入固定入口下载最新安装包即可。

## 范围

- 触发：`push` 到 `main`（包含 PR merge 后的 push）
- 平台产物：Windows（NSIS `.exe`）、macOS（`.dmg`）、Linux（`.AppImage`）
- 发布入口：固定一个 GitHub Release（预发布）`nightly`
- 文件命名：安装包文件名追加 commit 短 hash，方便定位

## 交付形态

### Release 入口

- 固定 tag：`nightly`
- 固定 Release 名称：`nightly`
- 该 Release 始终为 `prerelease=true`，且不设置为 latest

### 更新策略

- 每次 main 更新，构建三平台安装包
- 构建完成后强制更新 `nightly` tag 指向最新 commit
- 复用/更新 `nightly` Release，并用新产物覆盖旧资产

## 门禁与构建步骤

在各平台 runner 上执行：

- `npm ci --no-audit --no-fund`
- `npm run validate:yaml`
- `npm test`
- `npm run typecheck`
- `npm run dist`（不签名，`CSC_IDENTITY_AUTO_DISCOVERY=false`）

## 风险与限制

- 未签名安装包可能触发系统提示：
  - Windows SmartScreen
  - macOS Gatekeeper
- 该方案保证“永远有一个最新可下载版本”，但不会保留历史 nightly 版本（历史版本以 tag 发布为准）

## 验收标准

- main 每次 push 后，Actions 自动运行 Nightly 工作流
- 生成并上传 `.exe/.dmg/.AppImage` 至 `nightly` Release
- Release 标记为 prerelease，且不会覆盖正式 latest
- 安装包文件名包含 commit 短 hash

