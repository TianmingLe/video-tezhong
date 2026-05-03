import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TaskRecord, TaskStatus } from '../../../preload/types'
import { Skeleton } from '../components/Skeleton'
import { parseAnalysis, buildAggregateBundle } from '../features/aggregate/aggregateBundle'
import { AggregatePreviewCard } from '../features/aggregate/AggregatePreviewCard'

export function ReportsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TaskStatus | 'all'>('all')
  const [script, setScript] = useState<string>('all')
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([])
  const [aggregateDirName, setAggregateDirName] = useState<string | null>(null)
  const [aggregateFiles, setAggregateFiles] = useState<string[]>([])
  const [aggregateGenerating, setAggregateGenerating] = useState(false)

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

  const selectedSet = useMemo(() => new Set(selectedRunIds), [selectedRunIds])

  const toTime = (ts: number | null) => {
    if (!ts) return '-'
    return new Date(ts).toLocaleString()
  }

  const toggleSelected = (runId: string) => {
    setSelectedRunIds((prev) => {
      const set = new Set(prev)
      if (set.has(runId)) set.delete(runId)
      else set.add(runId)
      return Array.from(set)
    })
  }

  const clearSelection = () => setSelectedRunIds([])

  const generateAggregate = async () => {
    if (aggregateGenerating) return
    if (selectedRunIds.length === 0) return
    setAggregateGenerating(true)
    try {
      const runs: Array<{ runId: string; analyses: Array<{ fileName: string; data: Record<string, unknown> }> }> = []
      for (const runId of selectedRunIds) {
        const listRes = await window.api.job.listRunArtifacts(runId)
        if (!listRes.success) continue
        const names = listRes.files
          .map((x) => x.name)
          .filter((n) => n.startsWith('mvp_analysis_') && n.endsWith('.json'))
          .sort()
          .slice(0, 50)
        const analyses: Array<{ fileName: string; data: Record<string, unknown> }> = []
        for (const name of names) {
          const r = await window.api.job.readRunFile(runId, name, 512 * 1024)
          if (!r.success) continue
          const parsed = parseAnalysis(r.text)
          if (parsed) analyses.push({ fileName: name, data: parsed })
        }
        runs.push({ runId, analyses })
      }

      const bundle = buildAggregateBundle({ runs })
      const saved = await window.api.aggregate.save({ runs: selectedRunIds, files: bundle.files })
      setAggregateDirName(saved.dirName)
      setAggregateFiles(saved.files)
    } finally {
      setAggregateGenerating(false)
    }
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
          <button type="button" className="btn" onClick={generateAggregate} disabled={aggregateGenerating || selectedRunIds.length === 0}>
            生成聚合（{selectedRunIds.length}）
          </button>
          <button type="button" className="btn" onClick={clearSelection} disabled={selectedRunIds.length === 0}>
            清空选择
          </button>
        </div>

        {loading ? (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="muted" style={{ marginTop: 10 }}>
            暂无数据
          </div>
        ) : (
          <div className="list">
            {filtered.map((it) => (
              <div key={it.run_id} className="list-item" style={{ cursor: 'default', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(it.run_id)}
                  onChange={() => toggleSelected(it.run_id)}
                  style={{ marginTop: 4 }}
                />
                <button type="button" className="btn" onClick={() => navigate(`/report/${it.run_id}`)}>
                  打开
                </button>
                <div style={{ flex: 1 }}>
                  <div className="list-title">
                    {it.run_id} · {it.status}
                  </div>
                  <div className="list-subtitle">
                    {it.script} · {it.scenario} · start {toTime(it.start_time)} · end {toTime(it.end_time)} · exit {it.exit_code ?? '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {aggregateDirName ? (
        <AggregatePreviewCard
          dirName={aggregateDirName}
          files={aggregateFiles}
          onUpdateFiles={setAggregateFiles}
          onDeletedDir={() => {
            setAggregateDirName(null)
            setAggregateFiles([])
          }}
        />
      ) : null}
    </div>
  )
}
