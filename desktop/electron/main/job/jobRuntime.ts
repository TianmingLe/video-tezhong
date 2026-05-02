import path from 'node:path'
import { JobQueue, type EnqueueResult, type JobRequest } from './JobQueue'
import type { TasksRepo } from '../db/tasksRepo'
import type { TaskRecord } from '../db/types'

export type JobQueueStatus = {
  running: string[]
  pending: number
}

export type ProcessManagerLike = {
  start: (cfg: JobRequest) => Promise<{ success: true; pid: number } | { success: false; error: string }>
  onStart: (cb: (ev: { runId: string; pid: number }) => void) => () => void
  onExit: (cb: (ev: { runId: string; code: number | null; signal: NodeJS.Signals | null }) => void) => () => void
  onError: (cb: (ev: { runId: string; error: string }) => void) => () => void
}

export type JobRuntime = {
  queue: JobQueue
  enqueue: (cfg: JobRequest) => Promise<EnqueueResult>
  cancel: (runId: string) => Promise<void>
  dispose: () => void
}

function inferScenario(args: unknown): string {
  if (!Array.isArray(args)) return ''
  const parts = args.map((x) => String(x))
  const idx = parts.indexOf('--scenario')
  if (idx < 0) return ''
  return String(parts[idx + 1] ?? '').trim()
}

function computeDuration(cur: TaskRecord | null, endTime: number): number | null {
  const start = cur?.start_time
  if (typeof start !== 'number') return null
  if (!Number.isFinite(start)) return null
  return endTime - start
}

function ensureTaskRow(args: { tasksRepo: TasksRepo; runId: string; script: string; scenario: string }): void {
  const existing = args.tasksRepo.getById(args.runId)
  if (existing) return
  args.tasksRepo.insert({
    run_id: args.runId,
    script: args.script,
    scenario: args.scenario,
    status: 'queued',
    exit_code: null,
    start_time: null,
    end_time: null,
    duration: null
  })
}

function createThrottle(fn: () => void, waitMs: number): { trigger: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  const trigger = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      fn()
    }, waitMs)
  }

  const cancel = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  return { trigger, cancel }
}

export function createJobRuntime(args: {
  processManager: ProcessManagerLike
  tasksRepo: TasksRepo
  killTree: (pid: number) => Promise<void>
  onQueueUpdate?: (ev: JobQueueStatus) => void
  now?: () => number
  maxConcurrency?: number
}): JobRuntime {
  const now = args.now ?? (() => Date.now())

  const queue = new JobQueue({
    start: args.processManager.start,
    killTree: args.killTree,
    maxConcurrency: typeof args.maxConcurrency === 'number' ? args.maxConcurrency : 2
  })

  const throttledQueueUpdate = args.onQueueUpdate
    ? createThrottle(() => {
        const snap = queue.getSnapshot()
        args.onQueueUpdate?.({ running: snap.running.map((x) => x.runId), pending: snap.queued.length })
      }, 200)
    : null

  const emitQueueUpdate = () => throttledQueueUpdate?.trigger()

  const handleStart = (ev: { runId: string; pid: number }) => {
    const ts = now()
    try {
      args.tasksRepo.updateStatus({ run_id: ev.runId, status: 'running', start_time: ts })
    } catch {}
    emitQueueUpdate()
  }

  const handleExit = async (ev: { runId: string; code: number | null; signal: NodeJS.Signals | null }) => {
    await queue.onExit(ev)
    emitQueueUpdate()

    const ts = now()
    const cur = args.tasksRepo.getById(ev.runId)
    const duration = computeDuration(cur, ts)

    try {
      if (cur?.status === 'cancelled') {
        args.tasksRepo.updateStatus({ run_id: ev.runId, status: 'cancelled', end_time: ts, duration })
        return
      }
      args.tasksRepo.updateStatus({ run_id: ev.runId, status: 'exited', exit_code: ev.code, end_time: ts, duration })
    } catch {}
  }

  const handleError = (ev: { runId: string; error: string }) => {
    const ts = now()
    const cur = args.tasksRepo.getById(ev.runId)
    const duration = computeDuration(cur, ts)
    try {
      if (cur?.status === 'cancelled') {
        args.tasksRepo.updateStatus({ run_id: ev.runId, status: 'cancelled', end_time: ts, duration })
        return
      }
      args.tasksRepo.updateStatus({ run_id: ev.runId, status: 'error', end_time: ts, duration })
    } catch {}
    emitQueueUpdate()
  }


  const offStart = args.processManager.onStart(handleStart)
  const offExit = args.processManager.onExit((ev) => {
    void handleExit(ev)
  })
  const offError = args.processManager.onError(handleError)

  const enqueue = async (cfg: JobRequest): Promise<EnqueueResult> => {
    const runId = String(cfg?.runId || '').trim()
    const script = path.basename(String(cfg?.script || '').trim())
    const scenario = inferScenario(cfg?.args)

    if (runId) {
      try {
        ensureTaskRow({ tasksRepo: args.tasksRepo, runId, script, scenario })
        args.tasksRepo.updateStatus({ run_id: runId, status: 'queued' })
      } catch {}
    }

    const res = await queue.enqueue(cfg)
    emitQueueUpdate()
    if (!res.success && runId) {
      const ts = now()
      const cur = args.tasksRepo.getById(runId)
      const duration = computeDuration(cur, ts)
      try {
        args.tasksRepo.updateStatus({ run_id: runId, status: 'error', end_time: ts, duration })
      } catch {}
    }
    return res
  }

  const cancel = async (runId: string): Promise<void> => {
    const id = String(runId || '').trim()
    if (!id) return

    const ts = now()
    const cur = args.tasksRepo.getById(id)
    const duration = computeDuration(cur, ts)

    try {
      args.tasksRepo.updateStatus({ run_id: id, status: 'cancelled', end_time: ts, duration })
    } catch {}

    await queue.cancel(id)
    emitQueueUpdate()
  }

  const dispose = () => {
    offStart()
    offExit()
    offError()
    throttledQueueUpdate?.cancel()
  }

  return { queue, enqueue, cancel, dispose }
}
