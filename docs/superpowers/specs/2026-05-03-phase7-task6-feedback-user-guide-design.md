# Phase 7 Task 6：反馈通道（Issue 模板一键生成）+ USER_GUIDE（Design）

## 0. 目标

- 打通 Beta 反馈闭环：用户在 Settings 输入问题描述 → 一键生成并复制 GitHub Issue 模板文本
- 离线可用：不依赖网络请求；生成的内容用于用户手动粘贴到 GitHub
- 数据聚合：系统信息 + crash 摘要 + 最近任务上下文 + 用户输入
- 文档交付：新增 `docs/USER_GUIDE.md`（安装/更新、核心功能、FAQ、反馈指南）

## 1. 交付物

```
desktop/electron/main/feedback/
├── collectFeedbackBundle.ts
├── collectFeedbackBundle.test.ts
└── index.ts

desktop/electron/renderer/src/pages/
└── SettingsPage.tsx

desktop/electron/shared/ipc.ts
desktop/electron/preload/types.ts
desktop/electron/preload/index.ts

docs/
└── USER_GUIDE.md
```

## 2. 数据聚合：collectFeedbackBundle（main）

### 2.1 输入

```ts
type CollectFeedbackBundleInput = {
  userDataPath: string
  userDescription: string
}
```

`userDescription` 由 renderer 提供（Settings textarea），main 负责在最终 Markdown 中输出 “User Input” 区块。

### 2.2 数据来源与内容

#### System Info（表格）
- platform: `process.platform`
- arch: `process.arch`
- appVersion: `app.getVersion()`
- nodeVersion: `process.version`
- electronVersion: `process.versions.electron`（缺失 → `unknown`）

#### Crash Report（摘要）
- 目录：`<userData>/crash/`
- 读取最新 1-2 个 `.json` 文件（按 `mtimeMs desc`）
- 对每个文件：
  - parse JSON（允许失败；失败时输出“无法解析”）
  - 提取：`ts`、`processType`、`eventType`、`error.message`、`error.stack`（截断）
  - 仅输出摘要（不回传全量文件）

#### Task Context（最近任务）
- 来源：SQLite `tasks` 表最后一条记录（按现有 repo 的 `getAll()[0]` 语义）
- 输出字段：`runId`、`script`、`scenario`、`status`、`exitCode`

#### User Input（用户描述）
- Settings textarea
- 直接输出到 Markdown（无需插值/模板引擎）

### 2.3 输出格式（Issue 模板 Markdown）

`collectFeedbackBundle` 返回一段 Markdown 文本，可直接粘贴到 GitHub Issue：

- 标题建议行（可选）
- `## User Input`（用户描述）
- `## System Info`（Markdown 表格）
- `## Crash Reports`（每个 crash 用 `<details>` 折叠，含摘要与截断 stack）
- `## Last Task`（表格或要点）

## 3. IPC 与 preload

### 3.1 IPC channel

在 `desktop/electron/shared/ipc.ts` 添加：

- `feedbackCollectBundle: 'feedback:collectBundle'`

### 3.2 preload API

在 `desktop/electron/preload/types.ts` 的 `DesktopApi` 中新增：

```ts
feedback: {
  collectBundle: (args: { userDescription: string }) => Promise<{ markdown: string }>
}
```

## 4. Renderer：Settings 反馈入口

### 4.1 UI 位置

- `SettingsPage` 底部增加一张 `.card`
- 包含按钮 `.btn`：`反馈问题`

### 4.2 交互流程

1. 点击 `反馈问题` → 展开一个面板（复用 `.card` + state 条件渲染）
2. 用户输入问题描述（`<textarea>`）
3. 点击 `生成并复制`
   - 调用 `window.api.feedback.collectBundle({ userDescription })`
   - 将返回的 `markdown` 写入剪贴板
   - 提示 `已复制到剪贴板，请前往 GitHub 粘贴`
4. 剪贴板兼容（renderer 内实现）：
   - 优先 `navigator.clipboard.writeText`
   - fallback `document.execCommand('copy')`（隐藏 textarea）

## 5. 文档：docs/USER_GUIDE.md

必含章节：
- 安装与更新（安装包、自动更新行为说明、手动检查更新入口）
- 核心功能（任务配置、队列管理、日志查看、托盘操作、报告页）
- 常见问题（FAQ）
  - Python 环境检测失败
  - 日志导出
  - 任务卡顿处理
- 反馈指南（Issue 提交流程 + 本项目 issue 链接）
  - 链接：`https://github.com/TianmingLe/video-tezhong/issues/new`

## 6. 测试（TDD）

- `collectFeedbackBundle.test.ts`
  - System Info 表格字段存在
  - crash 目录为空/不存在 → 仍成功生成 Markdown
  - crash 文件存在 → 取最新 1-2 个且 stack 截断
  - 最近任务存在/不存在 → 均可生成（不存在时输出 `-`）
- 剪贴板降级逻辑：使用 renderer 侧可注入 helper（纯函数）做单测，避免引入重型 DOM 测试库

