import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TaskRecord, TaskStatus } from '../../../preload/types'

export function ReportsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TaskStatus | 'all'>('all')
  const [script, setScript] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.job
      .history()
      .then((list) => {
        if (cancelled) return
        setItems(list)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const scriptOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (it.script) set.add(it.script)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (status !== 'all' && it.status !== status) return false
      if (script !== 'all' && it.script !== script) return false
      return true
    })
  }, [items, status, script])

  const toTime = (ts: number | null) => {
    if (!ts) return '-'
    return new Date(ts).toLocaleString()
  }

  return (
    <div className="page">
      <h1 className="page-title">报告</h1>
      <p className="page-subtitle">历史任务（可按状态/脚本筛选）。</p>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as never)}>
            <option value="all">全部状态</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="exited">exited</option>
            <option value="error">error</option>
            <option value="cancelled">cancelled</option>
          </select>
          <select className="input" value={script} onChange={(e) => setScript(e.target.value)}>
            <option value="all">全部脚本</option>
            {scriptOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              setLoading(true)
              try {
                const list = await window.api.job.history()
                setItems(list)
              } finally {
                setLoading(false)
              }
            }}
          >
            刷新
          </button>
        </div>

        {loading ? (
          <div className="muted" style={{ marginTop: 10 }}>
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="muted" style={{ marginTop: 10 }}>
            暂无数据
          </div>
        ) : (
          <div className="list">
            {filtered.map((it) => (
              <button
                key={it.run_id}
                type="button"
                className="list-item"
                onClick={() => navigate(`/report/${it.run_id}`)}
              >
                <div className="list-title">
                  {it.run_id} · {it.status}
                </div>
                <div className="list-subtitle">
                  {it.script} · {it.scenario} · start {toTime(it.start_time)} · end {toTime(it.end_time)} · exit{' '}
                  {it.exit_code ?? '-'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
