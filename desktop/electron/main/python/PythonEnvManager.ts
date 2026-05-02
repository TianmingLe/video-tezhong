import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFile as nodeExecFile } from 'node:child_process'
import { isPythonVersionSupported, type CheckPythonResult } from '../system/checkPython'

export type EnvEnsureResult = { ok: true; pythonBin: string } | { ok: false; error: string; suggestion: string }

type ExecFile = (
  file: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
  cb: (error: any, stdout: string, stderr: string) => void
) => void

function execFileText(
  execFile: ExecFile,
  file: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      const code = typeof (error as any)?.code === 'number' ? (error as any).code : error ? 1 : 0
      resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true })
}

function removeDirSafe(p: string): void {
  try {
    fs.rmSync(p, { recursive: true, force: true })
  } catch {}
}

function getVenvPythonBin(venvPath: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') return path.join(venvPath, 'Scripts', 'python.exe')
  return path.join(venvPath, 'bin', 'python')
}

type InstalledMarker = {
  pythonVersion: string
  requirementsHash: string
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export class PythonEnvManager {
  private readonly userDataPath: string
  private readonly platform: NodeJS.Platform
  private readonly mediacrawlerRoot: string
  private readonly log: (line: string) => void
  private readonly execFile: ExecFile
  private readonly checkPython: () => Promise<CheckPythonResult>

  constructor(args: {
    userDataPath: string
    platform?: NodeJS.Platform
    mediacrawlerRoot: string
    log: (line: string) => void
    execFile?: ExecFile
    checkPython: () => Promise<CheckPythonResult>
  }) {
    this.userDataPath = args.userDataPath
    this.platform = args.platform ?? process.platform
    this.mediacrawlerRoot = args.mediacrawlerRoot
    this.log = args.log
    this.execFile = args.execFile ?? nodeExecFile
    this.checkPython = args.checkPython
  }

  private get venvPath(): string {
    return path.join(this.userDataPath, 'python', 'mediacrawler-venv')
  }

  private get markerPath(): string {
    return path.join(this.venvPath, '.omni-installed.json')
  }

  private computeRequirementsHash(): string {
    const reqPath = path.join(this.mediacrawlerRoot, 'requirements.txt')
    const content = fs.readFileSync(reqPath, 'utf-8')
    return sha256(content)
  }

  async ensureMediacrawlerEnv(args?: { pythonIndexUrl?: string }): Promise<EnvEnsureResult> {
    this.log('[python] 检测系统 Python…')
    const py = await this.checkPython()
    if (!py.ok) return { ok: false, error: py.error, suggestion: py.suggestion }
    if (!isPythonVersionSupported(py.version)) {
      return {
        ok: false,
        error: `Python 版本过低：${py.version}`,
        suggestion: '请安装 Python 3.11 及以上版本，并确保 PATH 可用。'
      }
    }

    const requirementsHash = this.computeRequirementsHash()
    const prev = readJsonSafe<InstalledMarker>(this.markerPath)
    const venvPython = getVenvPythonBin(this.venvPath, this.platform)

    const needInstall = !prev || prev.pythonVersion !== py.version || prev.requirementsHash !== requirementsHash || !fs.existsSync(venvPython)
    if (!needInstall) return { ok: true, pythonBin: venvPython }

    this.log('[python] 初始化运行环境（venv）…')
    removeDirSafe(this.venvPath)
    ensureDir(path.dirname(this.venvPath))

    const venvRes = await execFileText(this.execFile, py.bin, ['-m', 'venv', this.venvPath], { cwd: this.mediacrawlerRoot })
    if (venvRes.code !== 0) {
      return {
        ok: false,
        error: (venvRes.stderr || venvRes.stdout || 'create venv failed').trim(),
        suggestion: '创建 venv 失败：请检查 Python 安装是否完整，或确认目标目录有写权限。'
      }
    }

    const env: NodeJS.ProcessEnv = { ...process.env }
    if (args?.pythonIndexUrl) env.PIP_INDEX_URL = args.pythonIndexUrl

    this.log('[python] 安装依赖（pip）…')
    const pipUpgrade = await execFileText(this.execFile, venvPython, ['-m', 'pip', 'install', '-U', 'pip'], { cwd: this.mediacrawlerRoot, env })
    if (pipUpgrade.code !== 0) {
      return {
        ok: false,
        error: (pipUpgrade.stderr || pipUpgrade.stdout || 'pip upgrade failed').trim(),
        suggestion: 'pip 初始化失败：请检查网络/代理，或配置可用的 pip 源。'
      }
    }

    const reqPath = path.join(this.mediacrawlerRoot, 'requirements.txt')
    const pipInstall = await execFileText(this.execFile, venvPython, ['-m', 'pip', 'install', '-r', reqPath], { cwd: this.mediacrawlerRoot, env })
    if (pipInstall.code !== 0) {
      return {
        ok: false,
        error: (pipInstall.stderr || pipInstall.stdout || 'pip install failed').trim(),
        suggestion: '依赖安装失败：请检查网络/代理，或配置可用的 pip 源（例如国内镜像）。'
      }
    }

    writeJson(this.markerPath, { pythonVersion: py.version, requirementsHash } satisfies InstalledMarker)
    return { ok: true, pythonBin: venvPython }
  }
}
