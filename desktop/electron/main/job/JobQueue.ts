export type JobState = 'queued' | 'running' | 'exited' | 'error' | 'cancelled'

export type JobRequest = {
  runId: string
  script: string
  args: string[]
  env?: Record<string, string>
}

export type JobStartResult =
  | { success: true; pid: number }
  | { success: false; error: string }

export type JobQueueDeps = {
  start: (req: JobRequest) => Promise<JobStartResult>
  killTree: (pid: number) => Promise<void>
}

export type JobQueueOptions = JobQueueDeps & {
  maxConcurrency?: number
}

export type EnqueueResult =
  | { success: true; state: 'running' }
  | { success: true; state: 'queued'; position: number }
  | { success: false; error: string }

export type CancelResult =
  | { success: true; state: 'cancelled' }
  | { success: false; error: string }

export type JobSnapshot = {
  runId: string
  state: JobState
  pid: number | null
  exitCode: number | null
  signal: NodeJS.Signals | null
  error: string | null
}

export type JobQueueSnapshot = {
  maxConcurrency: number
  running: JobSnapshot[]
  queued: JobSnapshot[]
  jobs: Record<string, JobSnapshot>
}

type JobRecord = {
  req: JobRequest
  state: JobState
  pid: number | null
  exitCode: number | null
  signal: NodeJS.Signals | null
  error: string | null
}

export class JobQueue {
  private deps: JobQueueDeps
  private maxConcurrency: number
  private jobs: Map<string, JobRecord>
  private runningOrder: string[]
  private queueOrder: string[]
  private starting: Set<string>

  constructor(opts: JobQueueOptions) {
    this.deps = { start: opts.start, killTree: opts.killTree }
    this.maxConcurrency = typeof opts.maxConcurrency === 'number' ? opts.maxConcurrency : 2
    this.jobs = new Map()
    this.runningOrder = []
    this.queueOrder = []
    this.starting = new Set()
  }

  getSnapshot(): JobQueueSnapshot {
    const jobs: Record<string, JobSnapshot> = {}
    for (const [runId, rec] of this.jobs.entries()) {
      jobs[runId] = {
        runId,
        state: rec.state,
        pid: rec.pid,
        exitCode: rec.exitCode,
        signal: rec.signal,
        error: rec.error
      }
    }

    return {
      maxConcurrency: this.maxConcurrency,
      running: this.runningOrder.map((id) => jobs[id]).filter(Boolean),
      queued: this.queueOrder.map((id) => jobs[id]).filter(Boolean),
      jobs
    }
  }

  async enqueue(req: JobRequest): Promise<EnqueueResult> {
    const runId = String(req.runId || '').trim()
    if (!runId) return { success: false, error: 'runId is required' }
    if (this.jobs.has(runId)) return { success: false, error: 'runId already exists' }

    const rec: JobRecord = {
      req: { ...req, runId },
      state: 'queued',
      pid: null,
      exitCode: null,
      signal: null,
      error: null
    }
    this.jobs.set(runId, rec)

    if (this.runningOrder.length + this.starting.size < this.maxConcurrency) {
      const started = await this.startRun(runId)
      if (!started) return { success: false, error: rec.error ?? 'start failed' }
      return { success: true, state: 'running' }
    }

    this.queueOrder.push(runId)
    rec.state = 'queued'
    return { success: true, state: 'queued', position: this.queueOrder.length }
  }

  async cancel(runId: string): Promise<CancelResult> {
    const id = String(runId || '').trim()
    if (!id) return { success: false, error: 'runId is required' }
    const rec = this.jobs.get(id)
    if (!rec) return { success: false, error: 'runId not found' }

    if (rec.state === 'queued') {
      this.queueOrder = this.queueOrder.filter((x) => x !== id)
      rec.state = 'cancelled'
      return { success: true, state: 'cancelled' }
    }

    if (rec.state === 'running') {
      this.runningOrder = this.runningOrder.filter((x) => x !== id)
      rec.state = 'cancelled'
      const pid = rec.pid
      if (typeof pid === 'number') await this.deps.killTree(pid)
      await this.maybeStartNext()
      return { success: true, state: 'cancelled' }
    }

    if (rec.state === 'cancelled') return { success: true, state: 'cancelled' }
    return { success: false, error: 'job not cancellable' }
  }

  async onExit(ev: { runId: string; code: number | null; signal: NodeJS.Signals | null }): Promise<void> {
    const id = String(ev.runId || '').trim()
    const rec = this.jobs.get(id)
    if (!rec) return

    rec.exitCode = ev.code
    rec.signal = ev.signal

    if (rec.state === 'running') {
      this.runningOrder = this.runningOrder.filter((x) => x !== id)
      rec.state = 'exited'
      await this.maybeStartNext()
    }
  }

  private async maybeStartNext(): Promise<void> {
    while (this.runningOrder.length + this.starting.size < this.maxConcurrency && this.queueOrder.length > 0) {
      const nextId = this.queueOrder.shift()
      if (!nextId) break
      const rec = this.jobs.get(nextId)
      if (!rec) continue
      if (rec.state !== 'queued') continue
      const started = await this.startRun(nextId)
      if (!started) continue
    }
  }

  private async startRun(runId: string): Promise<boolean> {
    const rec = this.jobs.get(runId)
    if (!rec) return false
    if (rec.state === 'cancelled') return false
    if (this.starting.has(runId)) return false

    this.starting.add(runId)

    let res: JobStartResult
    try {
      res = await this.deps.start(rec.req)
    } catch (e) {
      res = { success: false, error: String((e as any)?.message || e) }
    } finally {
      this.starting.delete(runId)
    }

    if (!res.success) {
      rec.state = 'error'
      rec.error = res.error
      await this.maybeStartNext()
      return false
    }

    const cur = this.jobs.get(runId)
    if (!cur) return false

    if (cur.state === 'cancelled') {
      cur.pid = res.pid
      await this.deps.killTree(res.pid)
      await this.maybeStartNext()
      return false
    }

    cur.pid = res.pid
    cur.state = 'running'
    this.runningOrder.push(runId)
    return true
  }
}
