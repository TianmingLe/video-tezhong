# Windows In-App Uninstall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Windows 安装包版本中提供“设置页一键卸载”：二次确认后启动卸载器并退出应用。

**Architecture:** Renderer 通过 preload 调用 IPC `app:uninstall`；主进程负责定位卸载器（安装目录优先，注册表兜底）并 `spawn` 启动；成功后退出应用。非 Windows 返回可读错误。

**Tech Stack:** Electron (main/preload/renderer) + Node child_process + Windows reg query

---

## 0. File Map

**Create**
- `desktop/electron/main/system/windowsUninstall.ts`
- `desktop/electron/main/system/windowsUninstall.test.ts`

**Modify**
- `desktop/electron/shared/ipc.ts`
- `desktop/electron/preload/types.ts`
- `desktop/electron/preload/index.ts`
- `desktop/electron/main/index.ts`
- `desktop/electron/renderer/src/pages/SettingsPage.tsx`
- `docs/USER_GUIDE.md`

---

### Task 1: Add IPC contract and preload API

**Files:**
- Modify: `desktop/electron/shared/ipc.ts`
- Modify: `desktop/electron/preload/types.ts`
- Modify: `desktop/electron/preload/index.ts`

- [ ] **Step 1: Add IPC channel**

Edit `desktop/electron/shared/ipc.ts`:

```ts
export const ipcChannels = {
  // ...
  appUninstall: 'app:uninstall'
} as const
```

- [ ] **Step 2: Add types**

Edit `desktop/electron/preload/types.ts`:

```ts
export type AppUninstallResult = { success: true } | { success: false; error: string }
```

Add to `DesktopApi['app']`:

```ts
app: {
  // ...
  uninstall: () => Promise<AppUninstallResult>
}
```

- [ ] **Step 3: Wire preload implementation**

Edit `desktop/electron/preload/index.ts`:

```ts
app: {
  // ...
  uninstall: async () => {
    return await ipcRenderer.invoke(ipcChannels.appUninstall)
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `cd /workspace/desktop && npm run typecheck`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/electron/shared/ipc.ts desktop/electron/preload/types.ts desktop/electron/preload/index.ts
git commit -m "feat(app): add uninstall IPC contract"
```

---

### Task 2: Implement Windows uninstall resolver (pure functions + tests)

**Files:**
- Create: `desktop/electron/main/system/windowsUninstall.ts`
- Create: `desktop/electron/main/system/windowsUninstall.test.ts`

- [ ] **Step 1: Write failing tests (parsers)**

Create `desktop/electron/main/system/windowsUninstall.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseUninstallString, findUninstallerInDir, parseRegQueryForProduct } from './windowsUninstall'

describe('windowsUninstall', () => {
  it('parseUninstallString parses quoted exe with args', () => {
    const r = parseUninstallString('\"C:\\\\App\\\\Uninstall OmniScraper Desktop.exe\" /S')
    expect(r?.command.toLowerCase()).toContain('uninstall omniscraper desktop.exe')
    expect(r?.args).toEqual(['/S'])
  })

  it('findUninstallerInDir prefers productName uninstall', () => {
    const files = ['Uninstall.exe', 'Uninstall OmniScraper Desktop.exe']
    const r = findUninstallerInDir('C:\\\\App', files, 'OmniScraper Desktop')
    expect(r?.toLowerCase()).toContain('uninstall omniscraper desktop.exe')
  })

  it('parseRegQueryForProduct picks uninstallString by displayName', () => {
    const out = `
HKEY_CURRENT_USER\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\Test
    DisplayName    REG_SZ    OmniScraper Desktop
    UninstallString    REG_SZ    \"C:\\\\App\\\\Uninstall OmniScraper Desktop.exe\"
`
    const r = parseRegQueryForProduct(out, 'OmniScraper Desktop')
    expect(r).toContain('Uninstall OmniScraper Desktop.exe')
  })
})
```

- [ ] **Step 2: Implement minimal functions**

Create `desktop/electron/main/system/windowsUninstall.ts` (minimal implementation to pass tests):

```ts
export function parseUninstallString(input: string): { command: string; args: string[] } | null {
  const s = String(input || '').trim()
  if (!s) return null
  const args: string[] = []
  let i = 0
  const readToken = () => {
    while (i < s.length && s[i] === ' ') i++
    if (i >= s.length) return ''
    if (s[i] === '\"') {
      i++
      const start = i
      while (i < s.length && s[i] !== '\"') i++
      const tok = s.slice(start, i)
      if (s[i] === '\"') i++
      return tok
    }
    const start = i
    while (i < s.length && s[i] !== ' ') i++
    return s.slice(start, i)
  }
  const command = readToken()
  while (i < s.length) {
    const tok = readToken()
    if (tok) args.push(tok)
  }
  return command ? { command, args } : null
}

export function findUninstallerInDir(dir: string, fileNames: string[], productName: string): string | null {
  const want = [`Uninstall ${productName}.exe`, 'Uninstall.exe', 'uninstall.exe']
  const hit = want.find((w) => fileNames.some((f) => f.toLowerCase() === w.toLowerCase()))
  if (!hit) return null
  return `${dir}\\\\${hit}`
}

export function parseRegQueryForProduct(stdout: string, productName: string): string | null {
  const s = String(stdout || '')
  const lines = s.split(/\\r?\\n/)
  let inBlock = false
  let matched = false
  let uninstall: string | null = null
  for (const line of lines) {
    if (line.startsWith('HKEY_')) {
      inBlock = true
      matched = false
      uninstall = null
      continue
    }
    if (!inBlock) continue
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\\s{2,}/)
    if (parts.length >= 3 && parts[0] === 'DisplayName' && parts[2] === productName) matched = true
    if (parts.length >= 3 && parts[0] === 'UninstallString') uninstall = parts.slice(2).join('  ')
    if (matched && uninstall) return uninstall
  }
  return null
}
```

- [ ] **Step 3: Run tests**

Run: `cd /workspace/desktop && npm test desktop/electron/main/system/windowsUninstall.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/main/system/windowsUninstall.ts desktop/electron/main/system/windowsUninstall.test.ts
git commit -m "feat(windows): add uninstall resolver"
```

---

### Task 3: Add main-process uninstall handler

**Files:**
- Modify: `desktop/electron/main/index.ts`
- Modify: `desktop/electron/main/system/windowsUninstall.ts`

- [ ] **Step 1: Extend implementation to execute uninstall**

Update `desktop/electron/main/system/windowsUninstall.ts` to export:

```ts
export type AppUninstallResult = { success: true } | { success: false; error: string }
export async function uninstallSelf(): Promise<AppUninstallResult> { /* win32 only */ }
```

Behavior:
- If `process.platform !== 'win32'` → `{ success:false, error:'windows only' }`
- Try install-dir uninstaller:
  - `const exePath = app.getPath('exe')`
  - list files under `path.dirname(exePath)` and call `findUninstallerInDir`
  - if found, `spawn(uninstaller, [], { detached:true, stdio:'ignore', windowsHide:false })`
- Else registry fallback:
  - `execFile('reg', ['query', <key>, '/s', '/v', 'UninstallString'])` + parse
  - parse uninstall string; prefer direct exe path; else `cmd.exe /c`
- On spawn success: `setTimeout(() => app.quit(), 250)` and return `{ success:true }`
- On errors: return `{ success:false, error:<message> }`

- [ ] **Step 2: Add IPC handler**

Edit `desktop/electron/main/index.ts`:

```ts
ipcMain.handle(ipcChannels.appUninstall, async () => {
  return await uninstallSelf()
})
```

- [ ] **Step 3: Run unit + typecheck**

Run:
- `cd /workspace/desktop && npm test`
- `cd /workspace/desktop && npm run typecheck`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/electron/main/index.ts desktop/electron/main/system/windowsUninstall.ts
git commit -m "feat(app): uninstall via main process"
```

---

### Task 4: Add Settings UI entry (Windows-only)

**Files:**
- Modify: `desktop/electron/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add button and confirm**

Add:
- `const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)`
- A card section shown only when `isWindows`
- Button click handler:
  - `const ok = window.confirm('将启动卸载程序并退出应用，是否继续？')`
  - call `window.api.app.uninstall()`
  - on error show toast

- [ ] **Step 2: Run tests**

Run: `cd /workspace/desktop && npm test`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add desktop/electron/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(settings): add uninstall entry (windows)"
```

---

### Task 5: Update docs and cut beta tag

**Files:**
- Modify: `docs/USER_GUIDE.md`

- [ ] **Step 1: Document uninstall**

Add to `docs/USER_GUIDE.md`:
- Windows：设置页「卸载应用」→ 二次确认 → 启动卸载器
- 失败兜底：Windows 系统设置里卸载

- [ ] **Step 2: Commit docs**

```bash
git add docs/USER_GUIDE.md
git commit -m "docs: add uninstall guide"
```

- [ ] **Step 3: Push and tag**

```bash
git push origin main
git tag -a v0.0.1-beta.2 -m "v0.0.1-beta.2"
git push origin v0.0.1-beta.2
```

Expected:
- GitHub Actions `Release` workflow triggers
- Windows 产物可在 GitHub Releases 的 `v0.0.1-beta.2` 预发布中下载

