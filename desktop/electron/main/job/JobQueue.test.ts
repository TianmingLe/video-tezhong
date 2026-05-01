import { describe, expect, test, vi } from 'vitest'
import { JobQueue } from './JobQueue'

type Req = { runId: string; script: string; args: string[] }

function req(runId: string): Req {
  return { runId, script: 'script.py', args: [] }
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
}

describe('JobQueue', () => {
  test('start 异步较慢时也会严格限制并发=2', async () => {
    let nextPid = 10
    const queue: Array<{
      promise: Promise<{ success: true; pid: number }>
      resolve: (v: { success: true; pid: number }) => void
    }> = []

    const makeDefer = () => {
      let resolve!: (v: { success: true; pid: number }) => void
      const promise = new Promise<{ success: true; pid: number }>((r) => {
        resolve = r
      })
      const d = { promise, resolve }
      queue.push(d)
      return d
    }

    const d1 = makeDefer()
    const d2 = makeDefer()
    const d3 = makeDefer()

    const start = vi.fn(async () => await queue.shift()!.promise)
    const killTree = vi.fn(async () => {})
    const q = new JobQueue({ start, killTree, maxConcurrency: 2 })

    const p1 = q.enqueue(req('r1'))
    const p2 = q.enqueue(req('r2'))
    const p3 = q.enqueue(req('r3'))

    const r3 = await p3
    expect(r3).toEqual({ success: true, state: 'queued', position: 1 })

    await flush()
    expect(start).toHaveBeenCalledTimes(2)

    d1.resolve({ success: true, pid: nextPid++ })
    d2.resolve({ success: true, pid: nextPid++ })
    expect(await p1).toEqual({ success: true, state: 'running' })
    expect(await p2).toEqual({ success: true, state: 'running' })

    const exitP = q.onExit({ runId: 'r1', code: 0, signal: null })
    await flush()
    expect(start).toHaveBeenCalledTimes(3)

    d3.resolve({ success: true, pid: nextPid++ })
    await exitP

    const snap = q.getSnapshot()
    expect(snap.running.map((j) => j.runId).sort()).toEqual(['r2', 'r3'])
    expect(snap.jobs['r3']?.state).toBe('running')
  })

  test('并发=2 时，第 3 个进入 queued', async () => {
    let nextPid = 100
    const start = vi.fn(async () => ({ success: true as const, pid: nextPid++ }))
    const killTree = vi.fn(async () => {})
    const q = new JobQueue({ start, killTree, maxConcurrency: 2 })

    const r1 = await q.enqueue(req('r1'))
    const r2 = await q.enqueue(req('r2'))
    const r3 = await q.enqueue(req('r3'))

    expect(r1).toEqual({ success: true, state: 'running' })
    expect(r2).toEqual({ success: true, state: 'running' })
    expect(r3).toEqual({ success: true, state: 'queued', position: 1 })
    expect(start).toHaveBeenCalledTimes(2)

    const snap = q.getSnapshot()
    expect(snap.running.map((j) => j.runId)).toEqual(['r1', 'r2'])
    expect(snap.queued.map((j) => j.runId)).toEqual(['r3'])
    expect(snap.jobs['r3']?.state).toBe('queued')
  })

  test('running 退出后 queued 自动转 running', async () => {
    let nextPid = 200
    const start = vi.fn(async () => ({ success: true as const, pid: nextPid++ }))
    const killTree = vi.fn(async () => {})
    const q = new JobQueue({ start, killTree, maxConcurrency: 2 })

    await q.enqueue(req('r1'))
    await q.enqueue(req('r2'))
    await q.enqueue(req('r3'))

    await q.onExit({ runId: 'r1', code: 0, signal: null })
    await flush()

    expect(start).toHaveBeenCalledTimes(3)

    const snap = q.getSnapshot()
    expect(snap.queued.length).toBe(0)
    expect(snap.running.map((j) => j.runId).sort()).toEqual(['r2', 'r3'])
    expect(snap.jobs['r1']?.state).toBe('exited')
  })

  test('cancel queued: 从队列移除并标记 cancelled', async () => {
    let nextPid = 300
    const start = vi.fn(async () => ({ success: true as const, pid: nextPid++ }))
    const killTree = vi.fn(async () => {})
    const q = new JobQueue({ start, killTree, maxConcurrency: 2 })

    await q.enqueue(req('r1'))
    await q.enqueue(req('r2'))
    await q.enqueue(req('r3'))

    const res = await q.cancel('r3')
    expect(res).toEqual({ success: true, state: 'cancelled' })
    expect(start).toHaveBeenCalledTimes(2)

    const snap = q.getSnapshot()
    expect(snap.queued.length).toBe(0)
    expect(snap.jobs['r3']?.state).toBe('cancelled')
  })

  test('cancel running: 触发 killTree，并释放并发名额启动 queued', async () => {
    let nextPid = 400
    const start = vi.fn(async () => ({ success: true as const, pid: nextPid++ }))
    const killTree = vi.fn(async () => {})
    const q = new JobQueue({ start, killTree, maxConcurrency: 2 })

    await q.enqueue(req('r1'))
    await q.enqueue(req('r2'))
    await q.enqueue(req('r3'))

    const res = await q.cancel('r1')
    expect(res).toEqual({ success: true, state: 'cancelled' })
    expect(killTree).toHaveBeenCalledWith(400)

    await flush()
    expect(start).toHaveBeenCalledTimes(3)

    const snap = q.getSnapshot()
    expect(snap.queued.length).toBe(0)
    expect(snap.jobs['r1']?.state).toBe('cancelled')
    expect(snap.jobs['r3']?.state).toBe('running')
  })
})
