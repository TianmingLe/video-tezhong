# Phase 5 Step 6B - Part 3：SQLite 容错降级 + Retry UI 统一（Design）

## 1. 目标

- SQLite 锁竞争重试（指数退避 3 次）提升并发写入稳定性
- DB 打开失败时只读降级（readonly fallback），并对 UI 显式提示与禁用写操作
- 统一重试交互：提供通用 RetryButton，接入 ReportPage 与 SettingsPage 的失败重试

## 2. SQLite 锁竞争重试

### 2.1 busy_timeout

在 DB 实例创建后设置：
- `pragma('busy_timeout = 3000')`

### 2.2 runWithRetry

位置：`desktop/electron/main/db/index.ts`

```ts
runWithRetry<T>(fn: () => T, retries = 3): T
```

行为：
- 若遇到 `SQLITE_BUSY` / `SQLITE_LOCKED` 或 message 包含 `database is locked`：
  - 依次 sleep：50ms / 100ms / 200ms
  - 最多重试 3 次（attempt=0..2）
- 其他错误直接抛出

测试：
- 通过 stub 函数前两次抛 busy 错误，第 3 次成功，断言重试次数与 sleep 参数

## 3. 只读降级模式（Read-Only Fallback）

位置：`desktop/electron/main/db/index.ts`（open）+ `desktop/electron/main/index.ts`（通知）

打开流程：
1. 尝试 RW：`new Database(dbPath)`
2. 失败则尝试 RO：`new Database(dbPath, { readonly: true })`
3. 若 RO 成功，设置 `dbState.isReadOnly = true`

通知：
- 新增 push channel：`app:notify`
- payload：`{ type: 'warning' | 'error', message: string }`
- 主进程在进入只读模式后立刻广播一次 warning

渲染降级：
- preload 暴露 `app.getDbState()` 与 `app.onNotify(cb)`
- TaskConfigForm 的“保存为模板”与 SettingsPage 的 KB 写操作按钮：只读模式下 disabled，并设置 `title` 提示

## 4. RetryButton（统一重试 UI）

位置：`desktop/electron/renderer/src/components/RetryButton.tsx`

props：
- `label: string`
- `onRetry: () => Promise<void>`

状态：
- idle / loading / error（loading 时按钮 disabled）

接入：
- ReportPage：归档日志读取失败显示 RetryButton
- SettingsPage：kb.save / kb.setDefault 失败显示内联 RetryButton

测试：
- `RetryButton.test.tsx` 使用 `react-dom/server` 校验渲染文本
- 状态机逻辑抽出为纯函数/控制器并测试点击后 loading → 成功回到 idle，失败进入 error

## 5. 门禁

- `npm test` 全绿（新增 db/retry.test.ts 与 RetryButton.test.tsx）
- `npm run typecheck` 0 error

