import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import path from 'node:path'
import treeKill from 'tree-kill'

export type JobConfig = {
  runId: string
  pythonBin?: string
  script: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
}

export type JobStartResult =
  | { success: true; pid: number }
  | { success: false; error: string }

export type JobLogEvent = {
  runId: string
  line: string
  ts: number
  parsed?: Record<string, unknown>
}

export type JobExitEvent = {
  runId: string
  code: number | null
  signal: NodeJS.Signals | null
}

export type PythonProcessManagerOptions = {
  pythonBin: string
  maxLogLines?: number
  logSink?: (ev: { runId: string; line: string }) => void
}

type JobState = {
  child: ChildProcessByStdio<null, Readable, Readable>
  stdoutBuf: string
  stderrBuf: string
  logs: string[]
}

export class PythonProcessManager {
  private pythonBin: string
  private maxLogLines: number
  private logSink?: (ev: { runId: string; line: string }) => void
  private jobs: Map<string, JobState>
  private completedLogs: Map<string, string[]>
  private logListeners: Set<(ev: JobLogEvent) => void>
  private exitListeners: Set<(ev: JobExitEvent) => void>
  private startListeners: Set<(ev: { runId: string; pid: number }) => void>
  private errorListeners: Set<(ev: { runId: string; error: string }) => void>

  constructor(opts: PythonProcessManagerOptions) {
    this.pythonBin = opts.pythonBin
    this.maxLogLines = typeof opts.maxLogLines === 'number' ? opts.maxLogLines : 1000
    this.logSink = opts.logSink
    this.jobs = new Map()
    this.completedLogs = new Map()
    this.logListeners = new Set()
    this.exitListeners = new Set()
    this.startListeners = new Set()
    this.errorListeners = new Set()
  }

  static inferRunId(line: string): string | undefined {
    const s = String(line || '').trim()
    if (!s) return undefined
    try {
      const obj = JSON.parse(s)
      if (obj && typeof obj === 'object') {
        const anyObj = obj as Record<string, unknown>
        const v = anyObj.trace_id ?? anyObj.run_id ?? anyObj.runId
        return typeof v === 'string' && v.trim() ? v : undefined
      }
    } catch {
      return undefined
    }
    return undefined
  }

  onLog(cb: (ev: JobLogEvent) => void): () => void {
    this.logListeners.add(cb)
    return () => this.logListeners.delete(cb)
  }

  onExit(cb: (ev: JobExitEvent) => void): () => void {
    this.exitListeners.add(cb)
    return () => this.exitListeners.delete(cb)
  }

  onStart(cb: (ev: { runId: string; pid: number }) => void): () => void {
    this.startListeners.add(cb)
    return () => this.startListeners.delete(cb)
  }

  onError(cb: (ev: { runId: string; error: string }) => void): () => void {
    this.errorListeners.add(cb)
    return () => this.errorListeners.delete(cb)
  }

  getLogs(runId: string): string[] {
    const st = this.jobs.get(runId)
    if (st) return [...st.logs]
    const done = this.completedLogs.get(runId)
    return done ? [...done] : []
  }

  async start(cfg: JobConfig): Promise<JobStartResult> {
    const runId = String(cfg.runId || '').trim()
    if (!runId) return { success: false, error: 'runId is required' }
    if (this.jobs.has(runId)) return { success: false, error: 'runId already running' }

    const cwd = cfg.cwd ? path.resolve(cfg.cwd) : process.cwd()
    const scriptPath = path.isAbsolute(cfg.script) ? cfg.script : path.resolve(cwd, cfg.script)
    const args = [scriptPath, ...(cfg.args || [])]
    const env = { ...process.env, ...(cfg.env || {}) }

    const child = spawn(cfg.pythonBin ?? this.pythonBin, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd, env })
    const st: JobState = { child, stdoutBuf: '', stderrBuf: '', logs: [] }
    this.jobs.set(runId, st)

    const pid = child.pid
    if (!pid) {
      this.jobs.delete(runId)
      return { success: false, error: 'spawn failed: pid not available' }
    }

    for (const cb of this.startListeners) cb({ runId, pid })

    child.stdout.on('data', (buf: Buffer) => this.handleChunk(runId, 'stdout', buf.toString('utf-8')))
    child.stderr.on('data', (buf: Buffer) => this.handleChunk(runId, 'stderr', buf.toString('utf-8')))
    child.on('error', (e) => {
      for (const cb of this.errorListeners) cb({ runId, error: String(e?.message || e) })
    })
    child.on('exit', (code, signal) => {
      this.flushBuffers(runId)
      const cur = this.jobs.get(runId)
      if (cur) this.completedLogs.set(runId, [...cur.logs])
      this.jobs.delete(runId)
      for (const cb of this.exitListeners) cb({ runId, code, signal })
    })

    return { success: true, pid }
  }

  async kill(runId: string): Promise<void> {
    const st = this.jobs.get(runId)
    if (!st) return
    const child = st.child
    const pid = child.pid
    if (!pid) return

    const exited = new Promise<void>((resolve) => {
      const off = this.onExit((ev) => {
        if (ev.runId === runId) {
          off()
          resolve()
        }
      })
    })

    if (!child.killed) {
      await new Promise<void>((resolve) => {
        treeKill(pid, 'SIGKILL', () => resolve())
      })
    }

    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000))
    await Promise.race([exited, timeout])
  }

  private handleChunk(runId: string, which: 'stdout' | 'stderr', chunk: string): void {
    const st = this.jobs.get(runId)
    if (!st) return

    if (which === 'stdout') st.stdoutBuf += chunk
    else st.stderrBuf += chunk

    const buf = which === 'stdout' ? st.stdoutBuf : st.stderrBuf
    const parts = buf.split('\n')
    const rest = parts.pop() ?? ''

    if (which === 'stdout') st.stdoutBuf = rest
    else st.stderrBuf = rest

    for (const raw of parts) {
      const line = raw.replace(/\r$/, '').trim()
      if (!line) continue
      this.appendLog(st, line)
      this.emitToSink(runId, line)
      const ev = this.buildLogEvent(runId, line)
      for (const cb of this.logListeners) cb(ev)
    }
  }

  private flushBuffers(runId: string): void {
    const st = this.jobs.get(runId)
    if (!st) return
    const leftovers = [st.stdoutBuf, st.stderrBuf]
      .map((s) => s.replace(/\r$/, '').trim())
      .filter(Boolean)
    st.stdoutBuf = ''
    st.stderrBuf = ''
    for (const line of leftovers) {
      this.appendLog(st, line)
      this.emitToSink(runId, line)
      const ev = this.buildLogEvent(runId, line)
      for (const cb of this.logListeners) cb(ev)
    }
  }

  private appendLog(st: JobState, line: string): void {
    st.logs.push(line)
    if (st.logs.length > this.maxLogLines) {
      st.logs.splice(0, st.logs.length - this.maxLogLines)
    }
  }

  private buildLogEvent(runId: string, line: string): JobLogEvent {
    const ts = Date.now()
    let parsed: Record<string, unknown> | undefined
    try {
      const obj = JSON.parse(line)
      if (obj && typeof obj === 'object') parsed = obj as Record<string, unknown>
    } catch {}
    return { runId, line, ts, parsed }
  }

  private emitToSink(runId: string, line: string): void {
    const sink = this.logSink
    if (!sink) return
    try {
      sink({ runId, line })
    } catch {}
  }
}
