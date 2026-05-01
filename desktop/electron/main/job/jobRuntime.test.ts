import { describe, expect, test, vi } from 'vitest'
import { createJobRuntime } from './jobRuntime'
import type { TasksRepo } from '../db/tasksRepo'
import type { TaskRecord } from '../db/types'

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

function createMockTasksRepo(): TasksRepo & {
  dump: () => TaskRecord[]
  mocks: { insert: ReturnType<typeof vi.fn>; updateStatus: ReturnType<typeof vi.fn> }
} {
  let nextId = 1
  const rows = new Map<string, TaskRecord>()

  const insertMock = vi.fn((input: any) => {
    const row: TaskRecord = { id: nextId++, ...input }
    rows.set(row.run_id, row)
    return row
  })

  const updateStatusMock = vi.fn((input: any) => {
    const cur = rows.get(input.run_id)
    if (!cur) throw new Error('task not found')
    const next: TaskRecord = {
      ...cur,
      status: input.status,
      exit_code: Object.prototype.hasOwnProperty.call(input, 'exit_code') ? input.exit_code : cur.exit_code,
      start_time: Object.prototype.hasOwnProperty.call(input, 'start_time') ? input.start_time : cur.start_time,
      end_time: Object.prototype.hasOwnProperty.call(input, 'end_time') ? input.end_time : cur.end_time,
      duration: Object.prototype.hasOwnProperty.call(input, 'duration') ? input.duration : cur.duration
    }
    rows.set(input.run_id, next)
    return next
  })

  const getById = vi.fn((runId: string) => rows.get(String(runId || '').trim()) ?? null)
  const getAll = vi.fn(() => Array.from(rows.values()))

  return {
    insert: insertMock as any,
    updateStatus: updateStatusMock as any,
    getById,
    getAll,
    dump: () => Array.from(rows.values()),
    mocks: { insert: insertMock, updateStatus: updateStatusMock }
  }
}

function createFakeProcessManager() {
  let nextPid = 1000
  const startListeners = new Set<(ev: { runId: string; pid: number }) => void>()
  const exitListeners = new Set<(ev: { runId: string; code: number | null; signal: NodeJS.Signals | null }) => void>()
  const errorListeners = new Set<(ev: { runId: string; error: string }) => void>()

  const start = vi.fn(async (cfg: { runId: string }) => {
    const pid = nextPid++
    for (const cb of startListeners) cb({ runId: cfg.runId, pid })
    return { success: true as const, pid }
  })

  return {
    start,
    onStart: (cb: (ev: { runId: string; pid: number }) => void) => {
      startListeners.add(cb)
      return () => startListeners.delete(cb)
    },
    onExit: (cb: (ev: { runId: string; code: number | null; signal: NodeJS.Signals | null }) => void) => {
      exitListeners.add(cb)
      return () => exitListeners.delete(cb)
    },
    onError: (cb: (ev: { runId: string; error: string }) => void) => {
      errorListeners.add(cb)
      return () => errorListeners.delete(cb)
    },
    emitExit: (runId: string, code: number | null) => {
      for (const cb of exitListeners) cb({ runId, code, signal: null })
    },
    emitError: (runId: string, error: string) => {
      for (const cb of errorListeners) cb({ runId, error })
    }
  }
}

describe('jobRuntime', () => {
  test('queued/running/exited 会按事件更新 tasksRepo，并在退出后自动启动下一个', async () => {
    const tasksRepo = createMockTasksRepo()
    const pm = createFakeProcessManager()
    const killTree = vi.fn(async () => {})

    let t = 100
    const now = () => (t += 10)

    const runtime = createJobRuntime({ processManager: pm as any, tasksRepo, killTree, now, maxConcurrency: 2 })

    const r1 = await runtime.enqueue({ runId: 'r1', script: 'scripts/a.py', args: ['--scenario', 's1'] })
    const r2 = await runtime.enqueue({ runId: 'r2', script: 'scripts/a.py', args: ['--scenario', 's1'] })
    const r3 = await runtime.enqueue({ runId: 'r3', script: 'scripts/a.py', args: ['--scenario', 's1'] })

    expect(r1).toEqual({ success: true, state: 'running' })
    expect(r2).toEqual({ success: true, state: 'running' })
    expect(r3).toEqual({ success: true, state: 'queued', position: 1 })

    expect(tasksRepo.mocks.updateStatus.mock.calls.map((c: any) => c[0])).toMatchObject([
      { run_id: 'r1', status: 'queued' },
      { run_id: 'r1', status: 'running' },
      { run_id: 'r2', status: 'queued' },
      { run_id: 'r2', status: 'running' },
      { run_id: 'r3', status: 'queued' }
    ])

    pm.emitExit('r1', 0)
    await flush()
    await flush()

    expect(tasksRepo.getById('r1')?.status).toBe('exited')
    expect(tasksRepo.getById('r3')?.status).toBe('running')

    const lastCalls = tasksRepo.mocks.updateStatus.mock.calls.map((c: any) => c[0])
    expect(lastCalls.some((c: any) => c.run_id === 'r1' && c.status === 'exited' && c.exit_code === 0)).toBe(true)
    expect(lastCalls.some((c: any) => c.run_id === 'r3' && c.status === 'running')).toBe(true)

    runtime.dispose()
  })
})
