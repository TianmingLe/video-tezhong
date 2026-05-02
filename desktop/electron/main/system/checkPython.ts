import { exec as nodeExec } from 'node:child_process'

export type CheckPythonResult =
  | { ok: true; version: string }
  | { ok: false; error: string; suggestion: string; version?: string }

function pickCandidates(platform: NodeJS.Platform): string[] {
  if (platform === 'win32') return ['python', 'python3']
  return ['python3', 'python']
}

function parsePythonVersion(output: string): string | null {
  const m = output.match(/Python\s+(\d+\.\d+(?:\.\d+)?)/i)
  return m?.[1] ?? null
}

function buildSuggestion(args: { platform: NodeJS.Platform; error: string; code?: string }): string {
  const msg = `${args.code ?? ''} ${args.error}`.toLowerCase()
  if (args.code === 'ENOENT' || msg.includes('not found') || msg.includes('is not recognized')) {
    if (args.platform === 'win32') return '未检测到 Python：请安装 Python 3，并在安装时勾选 “Add Python to PATH”。'
    if (args.platform === 'darwin') return '未检测到 Python：请安装 Python 3（例如使用 Homebrew：brew install python），并确保 PATH 可用。'
    return '未检测到 Python：请安装 Python 3 并确保已加入 PATH（例如 apt/yum/pacman 安装后重开终端）。'
  }

  if (args.code === 'EACCES' || args.code === 'EPERM' || msg.includes('permission denied') || msg.includes('eacces')) {
    return '检测 Python 时遇到权限问题：请检查文件/目录权限，或确认安全软件未拦截终端命令执行。'
  }

  return '检测 Python 失败：请确认已安装 Python 3，并能在终端中运行 python3 --version 或 python --version。'
}

export async function checkPython(args?: {
  platform?: NodeJS.Platform
  exec?: (command: string, cb: (error: any, stdout: string, stderr: string) => void) => void
}): Promise<CheckPythonResult> {
  const platform = args?.platform ?? process.platform
  const exec = args?.exec ?? nodeExec
  const candidates = pickCandidates(platform)

  let lastError: { message: string; code?: string } | null = null
  for (const bin of candidates) {
    const command = `${bin} --version`
    const r = await new Promise<{ error: any; stdout: string; stderr: string }>((resolve) => {
      exec(command, (error, stdout, stderr) => resolve({ error, stdout: stdout ?? '', stderr: stderr ?? '' }))
    })

    const combined = `${r.stdout}\n${r.stderr}`.trim()
    const version = parsePythonVersion(combined)

    if (!r.error && version) return { ok: true, version }
    if (r.error && version) return { ok: true, version }

    if (r.error) {
      lastError = { message: String(r.error?.message ?? r.error ?? 'unknown error'), code: String(r.error?.code ?? '') || undefined }
      continue
    }

    lastError = { message: combined || 'unable to parse version' }
  }

  const error = lastError?.message ?? 'unknown error'
  const suggestion = buildSuggestion({ platform, error, code: lastError?.code })
  return { ok: false, error, suggestion }
}

