import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import type { JobStatusEvent } from '../../../preload/types'
import { parseLogLine } from '../features/task/logUtils'
import type { LogItem } from '../features/task/logTypes'

type ReportNavState = {
  exitCode: number | null
  signal: string | null
  scenario: string
  script: string
  startedAt: number
  endedAt: number
}

export function ReportPage() {
  const { runId } = useParams()
  const rid = runId || ''
  const loc = useLocation()
  const nav = (loc.state || null) as ReportNavState | null
  const [status, setStatus] = useState<JobStatusEvent | null>(null)
  const [logs, setLogs] = useState<LogItem[]>([])

  useEffect(() => {
    if (!rid) return
    const offLog = window.api.job.onLog(rid, (line) => setLogs((p) => [...p, parseLogLine(line, p.length)]))
    const offStatus = window.api.job.onStatus(rid, (ev) => setStatus(ev))
    return () => {
      offLog()
      offStatus()
    }
  }, [rid])

  const summary = useMemo(() => {
    const out: LogItem[] = []
    for (const it of logs) {
      if (it.kind === 'json') {
        const m = it.msg.toLowerCase()
        if (m.includes('session') || m.includes('result') || m.includes('error')) out.push(it)
      }
    }
    return out.slice(-80)
  }, [logs])

  const exportLog = async () => {
    if (!rid) return
    await window.api.job.exportLog(rid)
  }

  return (
    <div className="page">
      <h1 className="page-title">报告</h1>
      <p className="page-subtitle">RunID: {rid}</p>

      <div className="card">
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={exportLog}>
            导出完整日志 (.log)
          </button>
          <div className="muted">状态: {status?.status || nav ? 'exited' : 'unknown'}</div>
          {nav && (
            <>
              <div className="muted">脚本: {nav.script}</div>
              <div className="muted">场景: {nav.scenario}</div>
              <div className="muted">退出码: {nav.exitCode ?? '-'}</div>
              <div className="muted">耗时: {Math.round((nav.endedAt - nav.startedAt) / 1000)}s</div>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <div className="label">关键事件摘要</div>
        </div>
        <pre className="console">{summary.map((it) => (it.kind === 'json' ? it.msg : it.raw)).join('\n')}</pre>
      </div>
    </div>
  )
}
