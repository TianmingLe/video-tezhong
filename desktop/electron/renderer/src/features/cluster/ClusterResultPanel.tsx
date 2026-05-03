import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ClusterGroup, ClusterIndexRow, ClusterResult } from './clusterTypes'

type Props = {
  dirName: string
  files: string[]
  result: ClusterResult
  rows: ClusterIndexRow[]
  clusters: ClusterGroup[]
  onUpdateFiles: (next: string[]) => void
  onDeletedDir: () => void
}

export function ClusterResultPanel(props: Props) {
  const [selected, setSelected] = useState<string>('')
  const [text, setText] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUseless, setShowUseless] = useState(false)
  const [filePick, setFilePick] = useState<Record<string, boolean>>({})

  const preferred = useMemo(() => props.files.find((x) => x === 'cluster_summary.md') ?? props.files[0] ?? '', [props.files])

  useEffect(() => {
    if (!selected && preferred) setSelected(preferred)
  }, [preferred, selected])

  const loadFile = useCallback(
    async (name: string) => {
      if (!props.dirName || !name) return
      setLoading(true)
      setError(null)
      try {
        const res = await window.api.cluster.readFile({ dirName: props.dirName, name, maxBytes: 1024 * 1024 })
        if (!res.success) throw new Error(res.error)
        setText(res.text)
      } catch (e) {
        setError(String((e as Error)?.message || e))
        setText('')
      } finally {
        setLoading(false)
      }
    },
    [props.dirName]
  )

  useEffect(() => {
    void loadFile(selected)
  }, [loadFile, selected])

  const pickedFiles = useMemo(() => Object.entries(filePick).filter(([, v]) => v).map(([k]) => k), [filePick])

  const togglePick = (name: string) => setFilePick((prev) => ({ ...prev, [name]: !prev[name] }))

  const exportNames = async (names: string[]) => {
    if (!names.length) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.cluster.export({ dirName: props.dirName, names })
      if (!res.success) throw new Error(res.error)
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const deleteDir = async () => {
    const ok = window.confirm('将删除本次 clusters 目录下的所有文件，不可恢复，是否继续？')
    if (!ok) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.cluster.delete({ dirName: props.dirName })
      if (!res.success) throw new Error(res.error)
      props.onDeletedDir()
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const deletePicked = async () => {
    if (!pickedFiles.length) return
    const ok = window.confirm(`将删除 ${pickedFiles.length} 个文件，不可恢复，是否继续？`)
    if (!ok) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.cluster.delete({ dirName: props.dirName, names: pickedFiles })
      if (!res.success) throw new Error(res.error)
      const nextFiles = props.files.filter((f) => !pickedFiles.includes(f))
      props.onUpdateFiles(nextFiles)
      setFilePick({})
      if (pickedFiles.includes(selected)) {
        const next = nextFiles[0] ?? ''
        setSelected(next)
        setText('')
      }
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const rowsById = useMemo(() => new Map(props.rows.map((r) => [r.id, r])), [props.rows])

  const renderBucket = (bucket: 0 | 1 | 2 | 3, title: string) => {
    const ids = props.result.buckets[String(bucket) as '0' | '1' | '2' | '3'] ?? []
    if (bucket === 0 && !showUseless) {
      return (
        <div className="row">
          <div className="label">{title}</div>
          <div className="muted">
            {ids.length} 条 <button className="btn" onClick={() => setShowUseless(true)}>展开</button>
          </div>
        </div>
      )
    }
    return (
      <div className="row">
        <div className="label">{title}</div>
        <div className="muted">{ids.length} 条</div>
        <div style={{ width: '100%' }}>
          {ids.slice(0, 80).map((id) => {
            const r = rowsById.get(id)
            if (!r) return null
            const text = (r.knowledge_point.title || r.knowledge_point.content || '').trim()
            return (
              <div key={id} className="muted" style={{ marginTop: 6 }}>
                - {text} ({r.video_url || r.run_id})
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card">
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600 }}>概览</div>
          <div className="muted">{props.dirName}</div>
        </div>
        <div className="row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="muted">强相关：{props.result.buckets['3']?.length ?? 0}</div>
          <div className="muted">中等：{props.result.buckets['2']?.length ?? 0}</div>
          <div className="muted">较弱：{props.result.buckets['1']?.length ?? 0}</div>
          <div className="muted">没用：{props.result.buckets['0']?.length ?? 0}</div>
          <div className="muted">
            处理：{props.result.stats.used_points}/{props.result.stats.total_points}
            {props.result.stats.truncated ? '（已截断）' : ''}
          </div>
          <div className="muted">LLM：{props.result.stats.use_llm ? '启用' : '未启用'}</div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600 }}>4 档相关性（知识点）</div>
          {showUseless ? (
            <button type="button" className="btn" onClick={() => setShowUseless(false)} disabled={loading}>
              折叠没用
            </button>
          ) : null}
        </div>
        {renderBucket(3, '强相关')}
        {renderBucket(2, '中等相关')}
        {renderBucket(1, '较弱相关')}
        {renderBucket(0, '没用')}
      </div>

      <div className="card">
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600 }}>主题簇</div>
          <div className="muted">{props.clusters.length ? `${props.clusters.length} 组` : '（未聚类）'}</div>
        </div>
        {props.clusters.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {props.clusters.slice(0, 20).map((c) => (
              <div key={c.cluster_id} className="row">
                <div className="label">
                  {c.name} ({c.item_ids.length})
                </div>
                <div className="muted">{c.description}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="row muted">未生成主题簇（LLM 不可用或聚类失败）</div>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600 }}>产物</div>
          <button type="button" className="btn" onClick={() => exportNames(props.files)} disabled={loading || !props.files.length}>
            导出全部
          </button>
          <button type="button" className="btn" onClick={() => exportNames(pickedFiles)} disabled={loading || pickedFiles.length === 0}>
            导出所选
          </button>
          <button type="button" className="btn" onClick={deletePicked} disabled={loading || pickedFiles.length === 0}>
            删除所选
          </button>
          <button type="button" className="btn" onClick={deleteDir} disabled={loading}>
            删除目录
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}

        {props.files.length ? (
          <div className="row" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {props.files.map((f) => (
              <label key={f} className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={Boolean(filePick[f])} onChange={() => togglePick(f)} disabled={loading} />
                {f}
              </label>
            ))}
          </div>
        ) : null}

        {props.files.length ? (
          <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="label">预览</label>
            <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading}>
              {props.files.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {selected && text ? (
          <pre className="log" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>
            {text}
          </pre>
        ) : null}
      </div>
    </div>
  )
}

