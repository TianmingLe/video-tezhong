import { execFile as nodeExecFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

export type EnvEnsureResult = { ok: true; pythonBin: string } | { ok: false; error: string; suggestion: string }

type ExecFile = (bin: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }) => Promise<void>

const execFileAsync = promisify(nodeExecFile)

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function readTextIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8')
  } catch {
    return null
  }
}

function getVenvPython(venvPath: string): string {
  if (process.platform === 'win32') return path.join(venvPath, 'Scripts', 'python.exe')
  return path.join(venvPath, 'bin', 'python')
}

export class PythonEnvManager {
  private userDataPath: string
  private mediaCrawlerRoot: string
  private systemPythonBin: string
  private systemPythonVersion: string
  private execFile: ExecFile

  constructor(args: {
    userDataPath: string
    mediaCrawlerRoot: string
    systemPythonBin: string
    systemPythonVersion?: string
    execFile?: ExecFile
  }) {
    this.userDataPath = args.userDataPath
    this.mediaCrawlerRoot = args.mediaCrawlerRoot
    this.systemPythonBin = args.systemPythonBin
    this.systemPythonVersion = args.systemPythonVersion ?? 'unknown'
    this.execFile =
      args.execFile ??
      (async (bin, argv, opts) => {
        await execFileAsync(bin, argv, { cwd: opts?.cwd, env: opts?.env })
      })
  }

  async ensureMediacrawlerEnv(args?: { pythonIndexUrl?: string }): Promise<EnvEnsureResult> {
    const requirementsPath = path.join(this.mediaCrawlerRoot, 'requirements.txt')
    const requirements = readTextIfExists(requirementsPath)
    if (!requirements) {
      return {
        ok: false,
        error: `requirements not found: ${requirementsPath}`,
        suggestion: '请确认安装包包含 MediaCrawler/requirements.txt，或在开发环境中从仓库根目录运行。'
      }
    }

    const requirementsHash = sha256(requirements)
    const venvPath = path.join(this.userDataPath, 'python', 'mediacrawler-venv')
    const markerPath = path.join(venvPath, '.omni-installed.json')
    const venvPython = getVenvPython(venvPath)

    const markerRaw = readTextIfExists(markerPath)
    if (markerRaw) {
      try {
        const m = JSON.parse(markerRaw) as any
        if (m && m.requirementsHash === requirementsHash && m.pythonVersion === this.systemPythonVersion) {
          return { ok: true, pythonBin: venvPython }
        }
      } catch {}
    }

    try {
      fs.rmSync(venvPath, { recursive: true, force: true })
      fs.mkdirSync(path.dirname(venvPath), { recursive: true })
    } catch {}

    try {
      await this.execFile(this.systemPythonBin, ['-m', 'venv', venvPath])
      fs.mkdirSync(venvPath, { recursive: true })

      const env: Record<string, string> = {}
      for (const [k, v] of Object.entries(process.env)) {
        if (typeof v === 'string') env[k] = v
      }
      const idx = String(args?.pythonIndexUrl ?? '').trim()
      if (idx) env.PIP_INDEX_URL = idx

      await this.execFile(venvPython, ['-m', 'pip', 'install', '-U', 'pip'], { env })
      await this.execFile(venvPython, ['-m', 'pip', 'install', '-r', requirementsPath], { env })

      fs.writeFileSync(
        markerPath,
        JSON.stringify({ pythonVersion: this.systemPythonVersion, requirementsHash }, null, 2),
        'utf-8'
      )

      return { ok: true, pythonBin: venvPython }
    } catch (e) {
      return {
        ok: false,
        error: String((e as any)?.message ?? e),
        suggestion: 'Python 依赖安装失败：请检查网络/代理、pip 源、以及是否能在终端中运行 python -m pip install ...'
      }
    }
  }
}
