# Phase 7 Task 5：I18nProvider + t(key) 基础架构（Design）

## 0. 目标

- 建立最小 i18n 基础设施：`I18nContext` + `useT()` + `t(key)`
- 默认中文（硬编码字典），暂不迁移现有全部文案
- 离线可用、零外部依赖、100% TypeScript

## 1. 红线约束（强制）

1) **零外部依赖**：不引入 i18next/react-intl 等任何 i18n 库  
2) **缺失 Key 降级**：`t(key)` 字典缺失时必须返回 `key` 本身  
3) **挂载位置精准**：`I18nProvider` 必须包裹在 `<Suspense>` 内部（与 Task 4 结构对齐），确保懒加载路由可用翻译上下文

## 2. API 设计

### 2.1 Context 值

```ts
export type I18nValue = {
  locale: 'zh-CN'
  t: (key: string) => string
}
```

### 2.2 useT()

```ts
export function useT(): (key: string) => string
```

- 直接返回 `context.t`
- 若 provider 缺失（理论上不应发生），返回一个降级实现 `t(key) => key`

### 2.3 字典

- `dict.zh-CN.ts` 输出一个 `Record<string, string>`
- 初始只包含极少量 key（示例：`app.title`, `nav.tasks` 等），用于验证链路；不做全量迁移

## 3. 挂载位置

文件：`desktop/electron/renderer/src/main.tsx`

严格保持 Task 4 外层结构不变，只在 `<Suspense>` 内包裹 Provider：

```tsx
<ErrorBoundary>
  <Suspense fallback={<InlineSkeleton />}>
    <I18nProvider>
      <AppRouter />
    </I18nProvider>
  </Suspense>
</ErrorBoundary>
```

## 4. 测试策略（TDD）

不引入重型测试库，沿用当前仓库模式（`vitest` + `react-dom/server`）。

- 单测目标：
  - Provider 存在时：`t('known')` 返回中文
  - Provider 存在时：`t('missing.key')` 返回 `'missing.key'`
  - Provider 缺失时：`useT()` 返回降级 `t(key)=>key`

## 5. 验收点

- 全工程无新增依赖
- 懒加载路由（kb/settings/reports/report）在 Provider 内也能调用 `useT()`
- `npm test`、`npm run typecheck` 全绿

