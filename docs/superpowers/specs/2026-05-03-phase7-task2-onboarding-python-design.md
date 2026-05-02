# Phase 7 Task 2：Onboarding 引导（/onboarding 独立路由）+ Python 环境检测（Design）

## 0. 硬约束

- 渲染进程零 fs 权限；所有文件读写必须在主进程完成，通过 IPC 暴露最小接口
- Onboarding 状态仅存于 `<userData>/onboarding.json`，不修改 Phase 5-6 SQLite schema
- 路由：`/onboarding` 为独立路由，不嵌套 AppShell；其余页面由 AppShell 承载并受路由守卫拦截
- 离线可用：Python 检测失败不阻断流程；更新/网络相关逻辑不得阻塞启动
- 类型安全：IPC channel 与 preload/types.ts 强类型对齐，禁止 any
- TDD：所有新增核心逻辑必须先写失败测试

## 1. Onboarding JSON 结构

文件路径：`<userData>/onboarding.json`

```ts
export type OnboardingState = {
  version: 1
  completed: boolean
  skippedAt?: number
}
```

规则：
- 文件不存在 → 视为 `{ version: 1, completed: false }`
- 文件损坏/字段不合法 → fallback 为 `{ version: 1, completed: false }`（不抛异常）
- 写入完成 → `{ version: 1, completed: true }`
- reset → `{ version: 1, completed: false }`（`skippedAt` 暂不使用，仅保留字段以便后续扩展）

## 2. 主进程：OnboardingStore（读写/重置）

模块：`desktop/electron/main/onboarding/onboardingStore.ts`

对外 API（主进程内部 + IPC handler 使用）：
- `read(): OnboardingState`
- `write(next: OnboardingState): void`
- `markCompleted(): OnboardingState`
- `reset(): OnboardingState`

实现要点：
- 仅依赖 `fs` + `path`，文件写入使用 `writeFileSync`（数据量极小，调用次数少），并保证目录存在
- parse 时对未知结构做严格校验（version 与 completed）

## 3. 主进程：Python 环境检测

模块：`desktop/electron/main/system/checkPython.ts`

返回结构：

```ts
export type CheckPythonResult =
  | { ok: true; version: string; error: null; suggestion: null }
  | { ok: false; version: null; error: string; suggestion: string }
```

命令策略：
- Windows：优先 `python --version`，失败后 fallback `python3 --version`
- macOS/Linux：优先 `python3 --version`，失败后 fallback `python --version`

解析策略：
- 支持 stdout/stderr 任一处返回 `Python X.Y.Z`
- 使用正则 `/(?:Python)\\s+(\\d+\\.\\d+\\.\\d+)/i` 抽取 version
- 对未安装/权限/未知错误输出用户友好 `error`，并生成 `suggestion`（引导用户安装 Python 3 并配置 PATH）

异步与非阻塞：
- 主进程使用 `child_process.exec` 异步执行
- Renderer 使用 Loading skeleton（不阻塞 Step 3 完成）

## 4. IPC 与 Preload API

IPC channel（新增到 `desktop/electron/shared/ipc.ts`）：
- `onboardingGet`: `onboarding:get`（invoke → OnboardingState）
- `onboardingComplete`: `onboarding:complete`（invoke → OnboardingState）
- `onboardingReset`: `onboarding:reset`（invoke → OnboardingState）
- `systemCheckPython`: `system:checkPython`（invoke → CheckPythonResult）

Preload 暴露（新增到 `DesktopApi`）：

```ts
onboarding: {
  getState: () => Promise<OnboardingState>
  complete: () => Promise<OnboardingState>
  reset: () => Promise<OnboardingState>
}
system: {
  checkPython: () => Promise<CheckPythonResult>
}
```

## 5. Renderer：路由与守卫

路由（`desktop/electron/renderer/src/app/router.tsx`）新增：
- 顶层 `{ path: '/onboarding', element: <OnboardingPage /> }`
- 原有 `/` + AppShell children 不变

守卫逻辑（AppShell 初始化时执行）：
- `window.api.onboarding.getState()`
- 若 `completed === false`：
  - `navigate('/onboarding', { replace: true })`
  - 目的：禁止用户通过返回键回到未完成 onboarding 前的页面

OnboardingPage 行为：
- 进入页时若 `completed === true`：`navigate('/tasks', { replace: true })`
- Step 3 完成按钮始终可点击（Python 检测失败仅展示提示，不阻断）
- 完成后调用 `window.api.onboarding.complete()`，再 `navigate('/tasks', { replace: true })`

## 6. Renderer：Onboarding UI（3 步）

文件：`desktop/electron/renderer/src/pages/OnboardingPage.tsx`

- Step 1：欢迎 + 简要说明
- Step 2：Python 检测
  - 初始展示 skeleton（Loading）
  - 点击“重新检测”触发 `window.api.system.checkPython()`
  - 成功：展示 version
  - 失败：展示 error + suggestion（友好文案）
- Step 3：完成页
  - “进入应用”按钮始终可点击

## 7. Settings：重新开始引导

Settings 新增按钮：
- 点击 → `window.api.onboarding.reset()` → `navigate('/onboarding', { replace: true })`

