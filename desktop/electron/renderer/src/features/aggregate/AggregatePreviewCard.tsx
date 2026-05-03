import { useCallback, useEffect, useMemo, useState } from 'react'

type Props = {
  dirName: string
  files: string[]
  onUpdateFiles: (next: string[]) => void
  onDeletedDir: () => void
}

export function AggregatePreviewCard(props: Props) {
  const dirName = props.dirName
  const [selected, setSelected] = useState<string>('')
  const [text, setText] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteSelection, setDeleteSelection] = useState<Record<string, boolean>>({})

  const hasFiles = props.files.length > 0
  const preferred = useMemo(() => {
    if (!hasFiles) return ''
    return props.files.find((x) => x === 'kb_summary.md') ?? props.files[0] ?? ''
  }, [hasFiles, props.files])

  useEffect(() => {
    if (!selected && preferred) setSelected(preferred)
  }, [preferred, selected])

  const loadFile = useCallback(
    async (name: string) => {
      if (!dirName || !name) return
      setLoading(true)
      setError(null)
      try {
        const res = await window.api.aggregate.readFile({ dirName, name, maxBytes: 1024 * 1024 })
        if (!res.success) throw new Error(res.error)
        setText(res.text)
      } catch (e) {
        setError(String((e as Error)?.message || e))
        setText('')
      } finally {
        setLoading(false)
      }
    },
    [dirName]
  )

  useEffect(() => {
    void loadFile(selected)
  }, [loadFile, selected])

  const toggleDeletePick = (name: string) => {
    setDeleteSelection((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const pickedToDelete = useMemo(() => Object.entries(deleteSelection).filter(([, v]) => v).map(([k]) => k), [deleteSelection])

  const deleteDir = async () => {
    const ok = window.confirm('将删除本次聚合目录下的所有文件，不可恢复，是否继续？')
    if (!ok) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.aggregate.delete({ dirName })
      if (!res.success) throw new Error(res.error)
      props.onDeletedDir()
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const deletePicked = async () => {
    if (pickedToDelete.length === 0) return
    const ok = window.confirm(`将删除 ${pickedToDelete.length} 个文件，不可恢复，是否继续？`)
    if (!ok) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.aggregate.delete({ dirName, names: pickedToDelete })
      if (!res.success) throw new Error(res.error)
      const nextFiles = props.files.filter((f) => !pickedToDelete.includes(f))
      props.onUpdateFiles(nextFiles)
      setDeleteSelection({})
      if (pickedToDelete.includes(selected)) {
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

  const exportAll = async () => {
    if (!props.files.length) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.aggregate.export({ dirName, names: props.files })
      if (!res.success) throw new Error(res.error)
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setLoading(false)
    }
  }

  const exportPicked = async () => {
    if (pickedToDelete.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.aggregate.export({ dirName, names: pickedToDelete })
      if (!res.success) throw new Error(res.error)
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600 }}>聚合预览</div>
        <div className="muted">{dirName}</div>
        <button type="button" className="btn" onClick={exportAll} disabled={loading || !props.files.length}>
          导出全部
        </button>
        <button type="button" className="btn" onClick={exportPicked} disabled={loading || pickedToDelete.length === 0}>
          导出所选
        </button>
        <button type="button" className="btn" onClick={deletePicked} disabled={loading || pickedToDelete.length === 0}>
          删除所选
        </button>
        <button type="button" className="btn" onClick={deleteDir} disabled={loading}>
          删除目录
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {hasFiles ? (
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="label">文件</label>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading}>
            {props.files.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="row muted">（无文件）</div>
      )}

      {props.files.length ? (
        <div className="row" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {props.files.map((f) => (
            <label key={f} className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={Boolean(deleteSelection[f])} onChange={() => toggleDeletePick(f)} disabled={loading} />
              {f}
            </label>
          ))}
        </div>
      ) : null}

      {selected && text ? (
        <pre className="log" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>
          {text}
        </pre>
      ) : null}
    </div>
  )
}

