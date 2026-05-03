import { execFile as nodeExecFile } from 'node:child_process'
import { promisify } from 'node:util'

export type CheckPythonResult =
  | { ok: true; version: string; bin: string }
  | { ok: false; error: string; suggestion: string; version?: string }

type ExecFile = (bin: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

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
  execFile?: ExecFile
}): Promise<CheckPythonResult> {
  const platform = args?.platform ?? process.platform
  const execFile: ExecFile =
    args?.execFile ??
    (async (bin, argv) => {
      const execFileAsync = promisify(nodeExecFile)
      const { stdout, stderr } = (await execFileAsync(bin, argv)) as any
      return { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }
    })
  const candidates = pickCandidates(platform)

  let lastError: { message: string; code?: string } | null = null
  for (const bin of candidates) {
    try {
      const r = await execFile(bin, ['--version'])
      const combined = `${r.stdout}\n${r.stderr}`.trim()
      const version = parsePythonVersion(combined)
      if (version) return { ok: true, version, bin }
      lastError = { message: combined || 'unable to parse version' }
    } catch (e) {
      const err = e as any
      const stdout = String(err?.stdout ?? '')
      const stderr = String(err?.stderr ?? '')
      const combined = `${stdout}\n${stderr}`.trim()
      const version = parsePythonVersion(combined)
      if (version) return { ok: true, version, bin }
      lastError = { message: String(err?.message ?? err ?? 'unknown error'), code: String(err?.code ?? '') || undefined }
      continue
    }
  }

  const error = lastError?.message ?? 'unknown error'
  const suggestion = buildSuggestion({ platform, error, code: lastError?.code })
  return { ok: false, error, suggestion }
}
