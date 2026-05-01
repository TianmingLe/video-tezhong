import { useState } from 'react'

export function TasksPage() {
  return (
    <div className="page">
      <h1 className="page-title">任务</h1>
      <p className="page-subtitle">Task 2：最小闭环 Demo（spawn/日志/取消）。</p>
      <div style={{ marginTop: 16 }}>
        <JobDemo />
      </div>
    </div>
  )
}

function JobDemo() {
  const [runId] = useState(() => `demo-${Date.now()}`)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const start = async () => {
    setLogs([])
    const off = window.api.job.onLog(runId, (line) => setLogs((prev) => [...prev, line]))
    const res = await window.api.job.start({ runId, script: 'scripts/mock_device.py', args: ['--scenario', 'normal'] })
    if (!res.success) {
      off()
      setLogs((prev) => [...prev, `ERROR: ${res.error}`])
      setRunning(false)
      return
    }
    setRunning(true)
    setTimeout(() => {
      off()
      setRunning(false)
    }, 1500)
  }

  const cancel = async () => {
    await window.api.job.cancel(runId)
    setRunning(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" disabled={running} onClick={start}>
          开始
        </button>
        <button type="button" className="btn" disabled={!running} onClick={cancel}>
          取消
        </button>
      </div>
      <pre className="console" style={{ marginTop: 10, maxHeight: 220, overflow: 'auto' }}>
        {logs.join('\n')}
      </pre>
    </div>
  )
}
