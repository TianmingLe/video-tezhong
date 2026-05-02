import fs from 'node:fs'
import path from 'node:path'

export type LogArchive = {
  ensureDir: () => void
  appendLog: (runId: string, line: string) => void
  getLogContent: (runId: string) => string | null
  exportLog: (
    runId: string,
    targetFilePath: string,
    opts?: { fallbackContent?: string }
  ) => { success: true } | { success: false; error: string }
}

export function createLogArchive(args: { userDataPath: string }): LogArchive {
  const userDataPath = path.resolve(String(args.userDataPath || ''))
  const logsDir = path.join(userDataPath, 'logs')

  const ensureDir = () => {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  const sanitizeRunId = (runId: string): string => {
    const id = String(runId || '').trim()
    if (!id) throw new Error('runId is required')
    if (id.includes('..') || id.includes('/') || id.includes('\\')) throw new Error('invalid runId')
    return id
  }

  const logFilePath = (runId: string): string => {
    const id = sanitizeRunId(runId)
    const base = path.resolve(logsDir)
    const full = path.resolve(base, `${id}.log`)
    if (!full.startsWith(base + path.sep)) throw new Error('invalid runId')
    return full
  }

  const appendLog = (runId: string, line: string): void => {
    ensureDir()
    const fp = logFilePath(runId)
    const s = String(line ?? '').replace(/\r?\n$/, '')
    fs.appendFileSync(fp, `${s}\n`, 'utf-8')
  }

  const getLogContent = (runId: string): string | null => {
    const fp = logFilePath(runId)
    try {
      return fs.readFileSync(fp, 'utf-8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err?.code === 'ENOENT') return null
      throw e
    }
  }

  const exportLog: LogArchive['exportLog'] = (runId, targetFilePath, opts) => {
    try {
      const fp = logFilePath(runId)
      if (fs.existsSync(fp)) {
        fs.copyFileSync(fp, targetFilePath)
        return { success: true }
      }

      const fallback = String(opts?.fallbackContent ?? '')
      fs.writeFileSync(targetFilePath, fallback, 'utf-8')
      return { success: true }
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) }
    }
  }

  return { ensureDir, appendLog, getLogContent, exportLog }
}
