import fs from 'node:fs'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'

export type AppUninstallResult = { success: true } | { success: false; error: string }

export function parseUninstallString(input: string): { command: string; args: string[] } | null {
  const s = String(input || '').trim()
  if (!s) return null

  const args: string[] = []
  let i = 0

  const readToken = () => {
    while (i < s.length && s[i] === ' ') i++
    if (i >= s.length) return ''
    if (s[i] === '"') {
      i++
      const start = i
      while (i < s.length && s[i] !== '"') i++
      const tok = s.slice(start, i)
      if (s[i] === '"') i++
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
  const candidates = [`Uninstall ${productName}.exe`, 'Uninstall.exe', 'uninstall.exe']
  const hit = candidates.find((c) => fileNames.some((f) => f.toLowerCase() === c.toLowerCase()))
  return hit ? path.join(dir, hit) : null
}

export function parseRegQueryForProduct(stdout: string, productName: string): string | null {
  const s = String(stdout || '')
  const lines = s.split(/\r?\n/)

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

    const parts = trimmed.split(/\s{2,}/)
    if (parts.length >= 3 && parts[0] === 'DisplayName' && parts[2] === productName) matched = true
    if (parts.length >= 3 && parts[0] === 'UninstallString') uninstall = parts.slice(2).join('  ')
    if (matched && uninstall) return uninstall
  }
  return null
}

function execFileText(file: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      const code = typeof (error as any)?.code === 'number' ? (error as any).code : error ? 1 : 0
      resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

async function findUninstallerFromRegistry(productName: string): Promise<string | null> {
  const roots = ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall']
  for (const root of roots) {
    const res = await execFileText('reg', ['query', root, '/s', '/v', 'UninstallString'])
    if (res.code !== 0) continue
    const picked = parseRegQueryForProduct(res.stdout, productName)
    if (picked) return picked
  }
  return null
}

export async function uninstallSelf(): Promise<AppUninstallResult> {
  if (process.platform !== 'win32') return { success: false, error: 'windows only' }

  const { app } = await import('electron')
  const productName = app.getName()
  const exePath = app.getPath('exe')
  const installDir = path.dirname(exePath)

  try {
    const files = fs.readdirSync(installDir)
    const uninstallerPath = findUninstallerInDir(installDir, files, productName)
    if (uninstallerPath && fs.existsSync(uninstallerPath)) {
      spawn(uninstallerPath, [], { detached: true, stdio: 'ignore', windowsHide: false })
      setTimeout(() => app.quit(), 250)
      return { success: true }
    }
  } catch (e) {
    const msg = String((e as Error)?.message || e)
    return { success: false, error: msg }
  }

  const uninstallString = await findUninstallerFromRegistry(productName)
  if (!uninstallString) return { success: false, error: 'uninstaller not found' }

  const parsed = parseUninstallString(uninstallString)
  if (parsed?.command && fs.existsSync(parsed.command)) {
    spawn(parsed.command, parsed.args, { detached: true, stdio: 'ignore', windowsHide: false })
    setTimeout(() => app.quit(), 250)
    return { success: true }
  }

  spawn('cmd.exe', ['/c', uninstallString], { detached: true, stdio: 'ignore', windowsHide: false })
  setTimeout(() => app.quit(), 250)
  return { success: true }
}
