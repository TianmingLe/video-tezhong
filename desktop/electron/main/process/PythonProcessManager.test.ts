import { describe, expect, test } from 'vitest'
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

describe('PythonProcessManager', () => {
  test('pythonBin override: 使用 cfg.pythonBin 而不是默认 pythonBin', async () => {
    const manager = new PythonProcessManager({ pythonBin: 'python3' })
    const runId = `bin-${Date.now()}`

    const res = await manager.start({
      runId,
      script: 'scripts/mock_device.py',
      args: ['--scenario', 'normal'],
      pythonBin: '__omni_missing_python_bin__'
    } as any)

    if (res.success) await manager.kill(runId)
    expect(res.success).toBe(false)
  })

  test('spawn: 启动并捕获首行日志', async () => {
    const manager = new PythonProcessManager({ pythonBin: 'python3' })
    const runId = `test-${Date.now()}`
    const logs: string[] = []

    manager.onLog((ev) => {
      if (ev.runId === runId) logs.push(ev.line)
    })

    const res = await manager.start({
      runId,
      script: 'scripts/mock_device.py',
      args: ['--scenario', 'normal', '--trace-id', 'trace-abc']
    })

    expect(res.success).toBe(true)
    if (!res.success) throw new Error('start failed')
    expect(res.pid).toBeTypeOf('number')

    await waitFor(
      () => logs.find((l) => l.includes('mock_device started')),
      { timeoutMs: 4000, intervalMs: 20 }
    )

    await manager.kill(runId)
  })

  test('cancel: 终止进程并收到 exited 事件', async () => {
    const manager = new PythonProcessManager({ pythonBin: 'python3' })
    const runId = `cancel-${Date.now()}`
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

    await manager.kill(runId)

    await waitFor(
      () => exits[0],
      { timeoutMs: 4000, intervalMs: 20 }
    )
  })

  test('run_id inference: 能从 JSON 行提取 trace_id', () => {
    const line = JSON.stringify({ ts: 1, trace_id: 'trace-999' })
    expect(PythonProcessManager.inferRunId(line)).toBe('trace-999')
  })

  test('ring buffer: 最多保留 1000 行', async () => {
    const manager = new PythonProcessManager({ pythonBin: 'python3', maxLogLines: 1000 })
    const runId = `spam-${Date.now()}`

    const res = await manager.start({
      runId,
      script: 'scripts/mock_device.py',
      args: ['--scenario', 'spam']
    })
    expect(res.success).toBe(true)

    await waitFor(
      () => {
        const logs = manager.getLogs(runId)
        return logs.length >= 900 ? logs.length : undefined
      },
      { timeoutMs: 4000, intervalMs: 20 }
    )

    await waitFor(
      () => {
        const logs = manager.getLogs(runId)
        return logs.length === 1000 ? logs.length : undefined
      },
      { timeoutMs: 6000, intervalMs: 20 }
    )
  })
})
