# Desktop Reports 多选聚合（规则版）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select run aggregation on Reports page to generate a rule-based knowledge base bundle (Markdown + JSON), auto-save to `<userData>/results/aggregates/`, support export, and support one-click/custom delete of aggregate outputs.

**Architecture:** Renderer reads `mvp_analysis_*.json` from selected runs via existing job artifact APIs and builds an `AggregateBundle` (md + json). Main exposes an aggregate file manager API to save/list/read/delete/export bundles under a safe directory rooted at `<userData>/results/aggregates/`.

**Tech Stack:** Electron main/preload/renderer, React, Vitest.

---

## File Map

**Create**
- `desktop/electron/main/aggregate/aggregateStore.ts`
- `desktop/electron/main/aggregate/aggregateStore.test.ts`
- `desktop/electron/renderer/src/features/aggregate/aggregateBundle.ts`
- `desktop/electron/renderer/src/features/aggregate/aggregateBundle.test.ts`
- `desktop/electron/renderer/src/features/aggregate/AggregatePreviewCard.tsx`

**Modify**
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/shared/ipc.test.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/renderer/src/pages/ReportsPage.tsx`

---

### Task 1: Main 侧 aggregates 存储模块（纯函数 + 单测）

**Files:**
- Create: `desktop/electron/main/aggregate/aggregateStore.ts`
- Test: `desktop/electron/main/aggregate/aggregateStore.test.ts`

- [ ] **Step 1: 写 failing test（内存 FS）**

```ts
import { describe, expect, test } from 'vitest'
import { createAggregateStore, type AggregateStoreFs } from './aggregateStore'

function createMemFs(): AggregateStoreFs & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  return {
    files,
    dirs,
    existsSync: (p) => files.has(p) || dirs.has(p),
    mkdirSync: (p, _opts) => {
      dirs.add(p)
    },
    readdirSync: (p) => {
      const out: string[] = []
      for (const d of dirs) {
        if (d.startsWith(p + '/')) {
          const rest = d.slice(p.length + 1)
          if (!rest.includes('/')) out.push(rest)
        }
      }
      return out
    },
    statSync: (p) => ({ isDirectory: () => dirs.has(p), mtimeMs: 1 } as any),
    writeFileSync: (p, data, _enc) => {
      files.set(p, String(data))
    },
    readFileSync: (p, _enc) => {
      const v = files.get(p)
      if (v == null) throw new Error('ENOENT')
      return v
    },
    rmSync: (p) => {
      files.delete(p)
      dirs.delete(p)
      for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k)
      for (const d of [...dirs]) if (d.startsWith(p + '/')) dirs.delete(d)
    },
    copyFileSync: (src, dst) => {
      const v = files.get(src)
      if (v == null) throw new Error('ENOENT')
      files.set(dst, v)
    }
  }
}

describe('aggregateStore', () => {
  test('save+list+read+delete roundtrip', () => {
    const fs = createMemFs()
    const store = createAggregateStore({ userDataPath: '/ud', fs, now: () => 1700000000000 })
    const saved = store.save({ runs: ['r1', 'r2'], files: { 'kb_summary.md': '# hi', 'kb_tags.json': '{}' } })
    expect(saved.dirName).toContain('1700000000000_2')
    expect(store.list().length).toBe(1)
    const md = store.readFile({ dirName: saved.dirName, name: 'kb_summary.md' })
    expect(md).toContain('# hi')
    store.delete({ dirName: saved.dirName })
    expect(store.list().length).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /workspace/desktop && npm test --silent -- electron/main/aggregate/aggregateStore.test.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 aggregateStore.ts（路径校验 + 只允许 aggregates 子目录）**

实现要点：
- root: `<userData>/results/aggregates`
- `save()` 生成 `dirName = <ts>_<nRuns>`，写入 `meta.json` 与 files
- `list()` 返回目录列表（按 mtime 倒序）
- `readFile()` 只允许读取当前 dirName 下文件
- `delete()` 支持整目录删除，或仅删除指定文件数组
- `copyToDir()` 将指定文件复制到目标目录（供 export handler 使用）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /workspace/desktop && npm test --silent -- electron/main/aggregate/aggregateStore.test.ts`

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/main/aggregate/aggregateStore.ts desktop/electron/main/aggregate/aggregateStore.test.ts
git commit -m "feat(aggregate): add aggregate store"
```

---

### Task 2: IPC + Preload：aggregate API

**Files:**
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/shared/ipc.test.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`
- Modify: `desktop/electron/main/index.ts`

- [ ] **Step 1: shared/ipc 增加 channels**

新增：
- `aggregateSave: 'aggregate:save'`
- `aggregateList: 'aggregate:list'`
- `aggregateReadFile: 'aggregate:readFile'`
- `aggregateDelete: 'aggregate:delete'`
- `aggregateExport: 'aggregate:export'`

- [ ] **Step 2: ipc.test.ts 补齐断言**

- [ ] **Step 3: preload/types.ts 增加类型**

新增：
```ts
export type AggregateSaved = { dirName: string; dirPath: string; files: string[] }
export type AggregateListItem = { dirName: string; dirPath: string; mtimeMs: number }
export type AggregateDeleteResult = { success: true } | { success: false; error: string }
export type AggregateExportResult = { success: true; dirPath: string } | { success: false; error: string }
```

在 `DesktopApi` 增加：
```ts
aggregate: {
  save: (input: { runs: string[]; files: Record<string, string> }) => Promise<AggregateSaved>
  list: () => Promise<AggregateListItem[]>
  readFile: (input: { dirName: string; name: string; maxBytes?: number }) => Promise<{ success: true; text: string } | { success: false; error: string }>
  delete: (input: { dirName: string; names?: string[] }) => Promise<AggregateDeleteResult>
  export: (input: { dirName: string; names: string[] }) => Promise<AggregateExportResult>
}
```

- [ ] **Step 4: preload/index.ts 增加桥接**

- [ ] **Step 5: main/index.ts 注册 handlers（使用 aggregateStore）**

实现要点：
- `save`: 写入 userData aggregates，返回 dirName/dirPath/files
- `list`: 列出历史 aggregates
- `readFile`: 读取 aggregates 文件（maxBytes 限制）
- `delete`: 删除目录或目录内指定 files
- `export`: `dialog.showOpenDialog({ properties: ['openDirectory','createDirectory'] })` 后复制所选 names 到目标目录

- [ ] **Step 6: Run typecheck + ipc tests**

Run:
```bash
cd /workspace/desktop
npm run typecheck
npm test --silent -- electron/shared/ipc.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add desktop/electron/shared/ipc.ts desktop/electron/shared/ipc.test.ts desktop/electron/preload/types.ts desktop/electron/preload/index.ts desktop/electron/main/index.ts desktop/electron/main/aggregate/aggregateStore.ts
git commit -m "feat(aggregate): expose aggregate api via ipc"
```

---

### Task 3: Renderer 聚合纯函数（md + json）+ 单测

**Files:**
- Create: `desktop/electron/renderer/src/features/aggregate/aggregateBundle.ts`
- Test: `desktop/electron/renderer/src/features/aggregate/aggregateBundle.test.ts`

- [ ] **Step 1: 写 failing test**

构造 2 个 analysis，校验：
- tags 统计
- consensus/controversy 去重
- ocr key_texts 去重
- md 必含关键章节

- [ ] **Step 2: 实现 aggregateBundle.ts**

提供：
- `parseAnalysis(text): object|null`
- `buildAggregateBundle({ runs: Array<{ runId: string; analyses: object[] }> }): { files: Record<string,string>; meta: object; preview: { md: string; json: Record<string,string> } }`

输出文件包含：
- `kb_summary.md`
- `kb_index.jsonl`
- `kb_tags.json`
- `kb_insights.json`
- `meta.json`

- [ ] **Step 3: 跑单测**

Run: `cd /workspace/desktop && npm test --silent -- electron/renderer/src/features/aggregate/aggregateBundle.test.ts`

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/renderer/src/features/aggregate/aggregateBundle.ts desktop/electron/renderer/src/features/aggregate/aggregateBundle.test.ts
git commit -m "feat(aggregate): add rule-based aggregate bundle builder"
```

---

### Task 4: ReportsPage 多选 UI + 生成预览卡片

**Files:**
- Create: `desktop/electron/renderer/src/features/aggregate/AggregatePreviewCard.tsx`
- Modify: `desktop/electron/renderer/src/pages/ReportsPage.tsx`

- [ ] **Step 1: ReportsPage 增加 checkbox 多选与工具条按钮**

状态：
- `selectedRunIds: string[]`
- `aggregate: { dirName, files, previewText, selectedFile } | null`

按钮：
- 生成聚合：读取每个 run 的 `mvp_analysis_*.json`（每 run 最多 50 个）并构建 bundle，然后调用 `window.api.aggregate.save`
- 清空选择

- [ ] **Step 2: AggregatePreviewCard**

显示：
- 保存目录名、文件列表
- 文件预览（下拉选择文件：md/json/jsonl）
- 导出（调用 aggregate.export）
- 删除目录（aggregate.delete）
- 自定义删除：勾选文件后 aggregate.delete({ names })

- [ ] **Step 3: typecheck**

Run: `cd /workspace/desktop && npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/renderer/src/pages/ReportsPage.tsx desktop/electron/renderer/src/features/aggregate/AggregatePreviewCard.tsx
git commit -m "feat(ui): add reports multi-select aggregation"
```

---

### Task 5: 门禁与发布

- [ ] **Step 1: 全量校验**

Run:
```bash
cd /workspace/desktop
npm run typecheck
npm test --silent
```

- [ ] **Step 2: pack 校验**

Run:
```bash
cd /workspace/desktop
npm run pack
```

- [ ] **Step 3: 合并 main 并 push**

按你的偏好执行（直接合并或 PR）。

---

## Self-Review Checklist

- [ ] 不读取/不删除原始 run 目录文件（删除范围仅 aggregates）
- [ ] 所有路径均做 traversal 防护（dirName/name/destDir）
- [ ] 读取文件有 maxBytes 限制，避免 UI 卡死
- [ ] 生成时对每个 run 的 analysis 文件数量做上限（默认 50）

