# Phase 7 Task 4：全站 ErrorBoundary（main.tsx 顶层）+ 复制错误信息（Design）

## 0. 目标

- 全站兜底（含 `/onboarding`）：渲染层任意组件崩溃、路由模块懒加载失败时，都能展示可操作的错误页
- 错误页零样式依赖：错误页 + 降级骨架屏 100% Inline Styles，避免样式系统异常导致白屏
- 极简逻辑：ErrorBoundary 仅做状态切换与渲染，核心测试聚焦纯函数 `formatErrorReport`
- 复制错误信息：包含 `appVersion`、`platform`、`errorSummary`，且支持剪贴板降级方案

## 1. 硬约束（红线）

1) **挂载结构（强制）**

`main.tsx` 必须为：

```tsx
<ErrorBoundary>
  <Suspense fallback={<InlineSkeleton />}>
    <AppRouter />
  </Suspense>
</ErrorBoundary>
```

其中 `AppRouter` 通过 `React.lazy` 动态 import，确保路由模块加载失败也能被全局捕获。

2) **零样式依赖（强制）**
- Error page 与 InlineSkeleton 不允许使用任何 CSS class、Tailwind、样式模块或外部样式文件
- 仅允许 Inline Styles（`style={{ ... }}`）

3) **TDD 聚焦（强制）**
- 单测主战场：`formatErrorReport` 纯函数（字段缺失降级、长栈截断、剪贴板 fallback 逻辑）
- ErrorBoundary 组件本身不引入重型测试库；以 typecheck + 最小状态机为主

## 2. 组件与模块

### 2.1 ErrorBoundary

文件：`desktop/electron/renderer/src/components/error/ErrorBoundary.tsx`

- class component，状态：

```ts
type ErrorBoundaryState =
  | { status: 'ok' }
  | { status: 'error'; error: Error; componentStack?: string }
```

- `static getDerivedStateFromError(error)` → `{ status: 'error', error }`
- `componentDidCatch(error, info)` → 记录 `info.componentStack`
- UI：
  - 错误摘要（message）
  - 可展开的 stack（折叠 `<details>`）
  - 三个按钮：复制错误信息、返回任务页、重新加载
  - 全部 Inline Styles

### 2.2 InlineSkeleton

文件：`desktop/electron/renderer/src/components/error/InlineSkeleton.tsx`

- 最小骨架屏（2-3 行灰块），Inline Styles
- 仅用于 `<Suspense fallback>`，避免白屏

### 2.3 formatErrorReport（纯函数）

文件：`desktop/electron/renderer/src/components/error/formatErrorReport.ts`

输入：

```ts
type FormatErrorReportInput = {
  appVersion?: string | null
  platform?: string | null
  href?: string | null
  error: unknown
  componentStack?: string | null
  maxStackChars?: number
}
```

输出：string（多行文本），包含：
- appVersion（缺失 → `unknown`）
- platform（缺失 → `unknown`；推荐用 `navigator.userAgent`）
- href（缺失 → `unknown`）
- errorSummary：message + stack（stack 支持截断）
- componentStack（可选）

### 2.4 Clipboard fallback（可测试）

文件：`desktop/electron/renderer/src/components/error/copyToClipboard.ts`

接口：

```ts
export async function copyToClipboard(args: {
  text: string
  clipboardWriteText?: (text: string) => Promise<void>
  execCommandCopy?: (text: string) => boolean
}): Promise<{ success: true } | { success: false; error: string }>
```

策略：
- 优先 `clipboardWriteText`
- fallback `execCommandCopy`
- 两者都失败返回 `{ success:false, error }`

## 3. 主入口挂载策略

文件：`desktop/electron/renderer/src/main.tsx`

- 将 `AppRouter` 改为 `React.lazy(() => import('./app/router').then(m => ({ default: m.AppRouter })))`
- render 树：
  - `<ErrorBoundary>` 外层
  - `<Suspense fallback={<InlineSkeleton />}>` 内层
  - `<AppRouter />` 最内层

## 4. 测试清单（vitest）

- `formatErrorReport.test.ts`
  - 缺失 appVersion/platform/href → 输出包含 `unknown`
  - error 为 string/Error/unknown object → 都能生成可读摘要
  - stack 超长时按 `maxStackChars` 截断并标注 `…(truncated)`
- `copyToClipboard.test.ts`
  - clipboardWriteText success
  - clipboardWriteText throws → fallback execCommandCopy success
  - 两者失败 → 返回 success:false

## 5. 验收点

- `/onboarding` 任意组件 throw 能进入错误页（全站兜底）
- 路由模块懒加载失败时能看到 InlineSkeleton 或错误页（不白屏）
- 错误页无 CSS 依赖（断网/样式崩溃仍可展示）
- `npm test`、`npm run typecheck` 全绿

