# Desktop LLM Settings + Report LLM Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global LLM settings (model/baseUrl/key with safeStorage encryption) and show per-run LLM analysis summaries on the Report page for MediaCrawler tasks.

**Architecture:** Persist LLM config as `<userData>/llm-config.json` (safeStorage ciphertext preferred). Renderer reads config to inject into MediaCrawler job payload; report page reads `mvp_analysis_*.json` artifacts and renders an aggregated summary.

**Tech Stack:** Electron (main/preload/renderer), React, Vitest, better-sqlite3 (existing), MediaCrawler Python runner (existing).

---

## File Map

**Create**
- `desktop/electron/main/llm/llmConfig.ts`
- `desktop/electron/main/llm/llmConfig.test.ts`
- `desktop/electron/renderer/src/features/llm/llmConfigSchema.ts`
- `desktop/electron/renderer/src/features/report/llmSummary.ts`
- `desktop/electron/renderer/src/features/report/llmSummary.test.ts`
- `desktop/electron/renderer/src/features/report/RunLlmSummaryPanel.tsx`

**Modify**
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/shared/ipc.test.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`
- `desktop/electron/renderer/src/features/task/TaskController.tsx`
- `desktop/electron/renderer/src/pages/ReportPage.tsx`

---

### Task 1: Main 侧 LLM 配置读写（safeStorage 优先）

**Files:**
- Create: `desktop/electron/main/llm/llmConfig.ts`
- Test: `desktop/electron/main/llm/llmConfig.test.ts`

- [ ] **Step 1: 写 failing test（内存 FS + fake safeStorage）**

```ts
import { describe, expect, test } from 'vitest'
import { loadLlmConfig, saveLlmConfig, type LlmConfigFs, type SafeStorageLike } from './llmConfig'

function createMemFs(): LlmConfigFs & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    existsSync: (p) => files.has(p),
    readFileSync: (p, _enc) => {
      const v = files.get(p)
      if (v == null) throw new Error('ENOENT')
      return v
    },
    writeFileSync: (p, data, _enc) => {
      files.set(p, data)
    },
    mkdirSync: (_p, _opts) => {}
  }
}

function createSafeStorage(enabled: boolean): SafeStorageLike {
  return {
    isEncryptionAvailable: () => enabled,
    encryptString: (s) => Buffer.from(`enc:${s}`, 'utf-8'),
    decryptString: (b) => b.toString('utf-8').replace(/^enc:/, '')
  }
}

describe('llmConfig', () => {
  test('save+load: safeStorage enabled uses ciphertext', () => {
    const fs = createMemFs()
    const ss = createSafeStorage(true)
    saveLlmConfig({ userDataPath: '/ud', fs, safeStorage: ss, config: { apiBaseUrl: 'u', model: 'm', apiKey: 'k', allowPlaintextFallback: true } })
    const got = loadLlmConfig({ userDataPath: '/ud', fs, safeStorage: ss })
    expect(got.apiBaseUrl).toBe('u')
    expect(got.model).toBe('m')
    expect(got.apiKey).toBe('k')
    expect(got.keyStorage).toBe('safeStorage')
  })

  test('save+load: safeStorage disabled fallback to plaintext when allowed', () => {
    const fs = createMemFs()
    const ss = createSafeStorage(false)
    saveLlmConfig({ userDataPath: '/ud', fs, safeStorage: ss, config: { apiBaseUrl: 'u', model: 'm', apiKey: 'k', allowPlaintextFallback: true } })
    const got = loadLlmConfig({ userDataPath: '/ud', fs, safeStorage: ss })
    expect(got.apiKey).toBe('k')
    expect(got.keyStorage).toBe('plain')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace/desktop && npm test --silent -- electron/main/llm/llmConfig.test.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 llmConfig.ts（对齐 trayConfig 的纯函数风格）**

```ts
import path from 'node:path'

export type LlmKeyStorage = 'safeStorage' | 'plain'

export type LlmConfigSnapshot = {
  apiBaseUrl: string
  model: string
  hasKey: boolean
  keyStorage: LlmKeyStorage | null
  encryptionAvailable: boolean
}

export type LlmConfigSecret = {
  apiKey: string | null
}

export type LlmConfigFile =
  | { apiBaseUrl: string; model: string; keyStorage: 'safeStorage'; apiKeyCiphertextBase64: string; updatedAt: number }
  | { apiBaseUrl: string; model: string; keyStorage: 'plain'; apiKeyPlain: string; updatedAt: number }

export type LlmConfigFs = {
  readFileSync: (filePath: string, encoding: 'utf-8') => string
  writeFileSync: (filePath: string, data: string, encoding: 'utf-8') => void
  existsSync: (filePath: string) => boolean
  mkdirSync: (dirPath: string, opts: { recursive: boolean }) => void
}

export type SafeStorageLike = {
  isEncryptionAvailable: () => boolean
  encryptString: (text: string) => Buffer
  decryptString: (buf: Buffer) => string
}

export function getLlmConfigFilePath(userDataPath: string): string {
  return path.join(userDataPath, 'llm-config.json')
}

export function loadLlmConfig(args: { userDataPath: string; fs: LlmConfigFs; safeStorage: SafeStorageLike }): LlmConfigSnapshot & LlmConfigSecret {
  const filePath = getLlmConfigFilePath(args.userDataPath)
  const encryptionAvailable = args.safeStorage.isEncryptionAvailable()
  if (!args.fs.existsSync(filePath)) return { apiBaseUrl: '', model: '', apiKey: null, hasKey: false, keyStorage: null, encryptionAvailable }

  try {
    const raw = args.fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<LlmConfigFile> | null
    const apiBaseUrl = String((parsed as any)?.apiBaseUrl ?? '')
    const model = String((parsed as any)?.model ?? '')
    const keyStorage = (parsed as any)?.keyStorage === 'safeStorage' || (parsed as any)?.keyStorage === 'plain' ? (parsed as any).keyStorage : null

    let apiKey: string | null = null
    if (keyStorage === 'safeStorage') {
      const b64 = String((parsed as any)?.apiKeyCiphertextBase64 ?? '')
      if (b64 && encryptionAvailable) apiKey = args.safeStorage.decryptString(Buffer.from(b64, 'base64'))
    } else if (keyStorage === 'plain') {
      const plain = String((parsed as any)?.apiKeyPlain ?? '')
      apiKey = plain || null
    }

    return { apiBaseUrl, model, apiKey, hasKey: Boolean(apiKey), keyStorage, encryptionAvailable }
  } catch {
    return { apiBaseUrl: '', model: '', apiKey: null, hasKey: false, keyStorage: null, encryptionAvailable }
  }
}

export function saveLlmConfig(args: {
  userDataPath: string
  fs: LlmConfigFs
  safeStorage: SafeStorageLike
  config: { apiBaseUrl: string; model: string; apiKey: string; allowPlaintextFallback: boolean }
  now?: () => number
}): LlmConfigSnapshot {
  const encryptionAvailable = args.safeStorage.isEncryptionAvailable()
  const apiBaseUrl = String(args.config.apiBaseUrl ?? '').trim()
  const model = String(args.config.model ?? '').trim()
  const apiKey = String(args.config.apiKey ?? '')
  const updatedAt = (args.now ?? (() => Date.now()))()

  args.fs.mkdirSync(args.userDataPath, { recursive: true })
  const filePath = getLlmConfigFilePath(args.userDataPath)

  let file: LlmConfigFile
  if (encryptionAvailable) {
    const buf = args.safeStorage.encryptString(apiKey)
    file = { apiBaseUrl, model, keyStorage: 'safeStorage', apiKeyCiphertextBase64: buf.toString('base64'), updatedAt }
  } else {
    if (!args.config.allowPlaintextFallback) {
      return { apiBaseUrl, model, hasKey: false, keyStorage: null, encryptionAvailable }
    }
    file = { apiBaseUrl, model, keyStorage: 'plain', apiKeyPlain: apiKey, updatedAt }
  }

  args.fs.writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8')
  return { apiBaseUrl, model, hasKey: Boolean(apiKey), keyStorage: file.keyStorage, encryptionAvailable }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace/desktop && npm test --silent -- electron/main/llm/llmConfig.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/main/llm/llmConfig.ts desktop/electron/main/llm/llmConfig.test.ts
git commit -m "feat(llm): add llm config persistence with safeStorage"
```

---

### Task 2: IPC + Preload 暴露 LLM Config API

**Files:**
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`
- Modify: `desktop/electron/main/index.ts`
- Test: `desktop/electron/shared/ipc.test.ts`

- [ ] **Step 1: 增加 ipcChannels**

在 `ipcChannels` 增加：
- `llmGetConfig: 'llm:getConfig'`
- `llmSetConfig: 'llm:setConfig'`

- [ ] **Step 2: 更新 ipcChannels 单测**

在 `ipc.test.ts` 增加：
```ts
expect(ipcChannels.llmGetConfig).toBe('llm:getConfig')
expect(ipcChannels.llmSetConfig).toBe('llm:setConfig')
```

- [ ] **Step 3: 扩展 preload types + api**

在 `preload/types.ts`：
- 增加类型：
```ts
export type LlmConfigView = { apiBaseUrl: string; model: string; hasKey: boolean; keyStorage: 'safeStorage' | 'plain' | null; encryptionAvailable: boolean }
export type LlmSetConfigResult = LlmConfigView
```
- 在 `DesktopApi` 增加：
```ts
llm: {
  getConfig: () => Promise<LlmConfigView>
  setConfig: (input: { apiBaseUrl: string; model: string; apiKey: string }) => Promise<LlmSetConfigResult>
}
```

在 `preload/index.ts` 增加桥接：
```ts
llm: {
  getConfig: async () => ipcRenderer.invoke(ipcChannels.llmGetConfig),
  setConfig: async (input) => ipcRenderer.invoke(ipcChannels.llmSetConfig, input)
}
```

- [ ] **Step 4: Main 注册 handler（不回传明文 key）**

在 `main/index.ts`：
- 引入 `safeStorage` 与 `loadLlmConfig/saveLlmConfig`
- `llm:getConfig`：
  - 读 config，返回 `apiBaseUrl/model/hasKey/keyStorage/encryptionAvailable`
- `llm:setConfig`：
  - 入参校验（字符串 trim，空值拒绝）
  - 调用 `saveLlmConfig({ allowPlaintextFallback: true })`
  - 返回 view

- [ ] **Step 5: Run typecheck + ipc test**

Run:
```bash
cd /workspace/desktop
npm run typecheck
npm test --silent -- electron/shared/ipc.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add desktop/electron/shared/ipc.ts desktop/electron/shared/ipc.test.ts desktop/electron/preload/types.ts desktop/electron/preload/index.ts desktop/electron/main/index.ts desktop/electron/main/llm/llmConfig.ts
git commit -m "feat(llm): expose llm config api via ipc"
```

---

### Task 3: SettingsPage 增加 LLM 配置 UI

**Files:**
- Create: `desktop/electron/renderer/src/features/llm/llmConfigSchema.ts`
- Modify: `desktop/electron/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: 增加 schema（输入校验）**

`llmConfigSchema.ts`：
```ts
import { z } from 'zod'
export const llmConfigSchema = z.object({
  apiBaseUrl: z.string().min(1),
  model: z.string().min(1),
  apiKey: z.string().min(1)
})
export type LlmConfigInput = z.infer<typeof llmConfigSchema>
```

- [ ] **Step 2: SettingsPage 新增 state + 读取配置**

在 `useEffect` 中调用 `window.api.llm.getConfig()`，填充：
- `apiBaseUrl`
- `model`
- `hasKey`（UI 显示“已保存 key / 未保存 key”）
- `encryptionAvailable` 与 `keyStorage`

新增输入框：
- Base URL（text）
- Model（text）
- API Key（password；默认空；只有输入时才更新）

新增按钮：
- 保存（校验通过后调用 `window.api.llm.setConfig`）
- 清除 Key（调用 setConfig 时传空 key 的策略：本次实现采用“清除 = setConfig(apiKey='') 并在 main 侧处理为删除文件或写入无 key”）

注意：不得把 key 写入 toast 文本或 console。

- [ ] **Step 3: typecheck**

Run: `cd /workspace/desktop && npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/renderer/src/pages/SettingsPage.tsx desktop/electron/renderer/src/features/llm/llmConfigSchema.ts
git commit -m "feat(ui): add llm settings in settings page"
```

---

### Task 4: 任务启动时自动注入（缺失则弹窗补齐并写回）

**Files:**
- Modify: `desktop/electron/renderer/src/features/task/TaskController.tsx`

- [ ] **Step 1: 抽出一个 helper（纯函数/可测）**

在文件内新增函数（不新增注释）：
- 判断 cfg 是否为 mediacrawler + enableLlm
- 调用 `window.api.llm.getConfig()`
- 缺失项时 `window.prompt` 依次补齐（baseUrl/model/key）
- 用户取消任何一步：返回 `{ enableLlm: false }`
- 补齐成功：调用 `window.api.llm.setConfig` 写回，并返回 `{ enableLlm: true, llmBaseUrl, llmModel, llmApiKey }`

- [ ] **Step 2: 注入到 job.start payload**

在现有 `cfg.script === 'mediacrawler'` 分支里：
- 在 payload.args 中写入 `enableLlm/llmModel/llmBaseUrl/llmApiKey`
- 若降级：`enableLlm=false`

- [ ] **Step 3: typecheck + 相关测试**

Run:
```bash
cd /workspace/desktop
npm run typecheck
npm test --silent -- electron/renderer/src/features/task/configSchema.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/renderer/src/features/task/TaskController.tsx
git commit -m "feat(task): inject llm config into mediacrawler runs"
```

---

### Task 5: ReportPage 增加 LLM 聚合摘要面板

**Files:**
- Create: `desktop/electron/renderer/src/features/report/llmSummary.ts`
- Test: `desktop/electron/renderer/src/features/report/llmSummary.test.ts`
- Create: `desktop/electron/renderer/src/features/report/RunLlmSummaryPanel.tsx`
- Modify: `desktop/electron/renderer/src/pages/ReportPage.tsx`

- [ ] **Step 1: 写聚合纯函数 + failing test**

`llmSummary.ts` 输出：
- `parseAnalysisJson(text: string): object | null`
- `summarizeAnalyses(list: object[]): { success: number; error: number; totalCostUsd: number; totalTokens: number; topTags: Array<{ tag: string; count: number }>; consensus: string[]; controversy: string[]; topKnowledgeTitles: string[] }`

测试样例（构造 2 个 analysis json）：
```ts
import { describe, expect, test } from 'vitest'
import { summarizeAnalyses } from './llmSummary'

describe('llmSummary', () => {
  test('summarizeAnalyses aggregates cost/tokens/tags/insights', () => {
    const a: any = {
      status: 'success',
      usage: { total_tokens: 100, cost_usd: 0.01 },
      comment_value_judge: { items: [{ tags: ['t1', 't2'] }, { tags: ['t1'] }] },
      community_insights: { consensus: ['c1'], controversy: ['v1'] },
      knowledge_points: [{ title: 'k1' }, { title: 'k2' }]
    }
    const b: any = { status: 'error' }
    const out = summarizeAnalyses([a, b])
    expect(out.success).toBe(1)
    expect(out.error).toBe(1)
    expect(out.totalTokens).toBe(100)
    expect(out.totalCostUsd).toBeCloseTo(0.01)
    expect(out.topTags[0]).toEqual({ tag: 't1', count: 2 })
    expect(out.consensus).toEqual(['c1'])
    expect(out.controversy).toEqual(['v1'])
    expect(out.topKnowledgeTitles).toEqual(['k1', 'k2'])
  })
})
```

- [ ] **Step 2: 实现 RunLlmSummaryPanel**

行为：
- 通过 `window.api.job.listRunArtifacts(runId)` 找到 `mvp_analysis_*.json` 文件（或 `results/mvp_analysis.json`）
- 读取前 N 个（例如 20 个）并解析，调用 `summarizeAnalyses`
- 渲染为卡片：
  - 成功/失败数
  - Tokens/Cost 汇总
  - Top tags（前 10）
  - 共识/争议（各前 10）
  - 知识点标题（前 10）

- [ ] **Step 3: 挂到 ReportPage**

在 `ReportPage.tsx` 的产物与时间轴附近插入：
```tsx
<RunLlmSummaryPanel runId={rid} />
```

- [ ] **Step 4: 跑测试与 typecheck**

Run:
```bash
cd /workspace/desktop
npm test --silent -- electron/renderer/src/features/report/llmSummary.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/renderer/src/features/report/llmSummary.ts desktop/electron/renderer/src/features/report/llmSummary.test.ts desktop/electron/renderer/src/features/report/RunLlmSummaryPanel.tsx desktop/electron/renderer/src/pages/ReportPage.tsx
git commit -m "feat(report): show llm analysis summary for a run"
```

---

### Task 6: 门禁与打包验证

**Files:**
- None (commands only)

- [ ] **Step 1: 全量校验**

Run:
```bash
cd /workspace/desktop
npm run typecheck
npm test --silent
```
Expected: 全绿

- [ ] **Step 2: 打包验证**

Run:
```bash
cd /workspace/desktop
npm run pack
```
Expected: electron-builder 成功生成 `desktop/release/*`（该目录已在 .gitignore）

- [ ] **Step 3: 推送 main**

```bash
git push origin main
```

---

## Self-Review Checklist

- [ ] Settings 不显示明文 key，且不会把 key 写入 toast/console/log
- [ ] safeStorage 不可用时按用户选择允许明文存储（可用时必须加密）
- [ ] 启用 LLM 且配置缺失时，启动前弹窗补齐；取消则降级继续跑
- [ ] 报告页能正确识别并聚合 `mvp_analysis_*.json`，解析异常不影响其它面板

