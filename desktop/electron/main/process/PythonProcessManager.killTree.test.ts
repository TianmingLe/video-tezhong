import { describe, expect, test, vi } from 'vitest'

const treeKillMock = vi.hoisted(() =>
  vi.fn((pid: number, signal: string, cb?: (err?: Error) => void) => {
    try {
      process.kill(pid, signal as any)
    } catch {}
    cb?.()
  })
)

vi.mock('tree-kill', () => ({ default: treeKillMock }))

import { PythonProcessManager } from './PythonProcessManager'

function waitFor<T>(
  fn: () => T | undefined,
  opts: { timeoutMs: number; intervalMs: number }
): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(() => {
      const v = fn()
      if (v !== undefined) {
        clearInterval(timer)
        resolve(v)
        return
      }
      if (Date.now() - start > opts.timeoutMs) {
        clearInterval(timer)
        reject(new Error('timeout'))
      }
    }, opts.intervalMs)
  })
}

describe('PythonProcessManager.kill', () => {
  test('cancel: 会通过 tree-kill(pid, SIGKILL) 清理进程树', async () => {
    const manager = new PythonProcessManager({ pythonBin: 'python3' })
    const runId = `killtree-${Date.now()}`
    const exits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = []

    manager.onExit((ev) => {
      if (ev.runId === runId) exits.push({ code: ev.code, signal: ev.signal })
    })

    const res = await manager.start({
      runId,
      script: 'scripts/mock_device.py',
      args: ['--scenario', 'normal']
    })

    expect(res.success).toBe(true)
    if (!res.success) throw new Error('start failed')

    await manager.kill(runId)

    await waitFor(
      () => exits[0],
      { timeoutMs: 4000, intervalMs: 20 }
    )

    expect(treeKillMock).toHaveBeenCalled()
    expect(treeKillMock.mock.calls[0]?.[0]).toBe(res.pid)
    expect(treeKillMock.mock.calls[0]?.[1]).toBe('SIGKILL')
  })
})
