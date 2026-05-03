import { useCallback, useEffect, useState } from 'react'

type Props = {
  runId: string
}

export function RunArtifactsPanel(props: Props) {
  const rid = props.runId
  const [files, setFiles] = useState<Array<{ name: string; size: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [text, setText] = useState<string>('')

  const hasFiles = files.length > 0

  const loadList = useCallback(async () => {
    if (!rid) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.job.listRunArtifacts(rid)
      if (!res.success) throw new Error(res.error)
      setFiles(res.files)
      const preferred = res.files.find((x) => x.name === 'mvp_report.md')?.name ?? res.files[0]?.name ?? ''
      setSelected((prev) => prev || preferred)
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setLoading(false)
    }
  }, [rid])

  const loadFile = useCallback(
    async (name: string) => {
      if (!rid || !name) return
      setLoading(true)
      setError(null)
      try {
        const res = await window.api.job.readRunFile(rid, name, 512 * 1024)
        if (!res.success) throw new Error(res.error)
        setText(res.text)
      } catch (e) {
        setError(String((e as Error)?.message || e))
        setText('')
      } finally {
        setLoading(false)
      }
    },
    [rid]
  )

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadFile(selected)
  }, [loadFile, selected])

  return (
    <div className="card">
      <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600 }}>产物预览</div>
        <button type="button" className="btn" onClick={loadList} disabled={!rid || loading}>
          刷新
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {hasFiles ? (
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="label">文件</label>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading}>
            {files.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name} ({Math.round(f.size / 1024)} KB)
              </option>
            ))}
          </select>
        </div>
      ) : loading ? (
        <div className="row">加载中…</div>
      ) : (
        <div className="row" style={{ opacity: 0.7 }}>
          未找到产物文件
        </div>
      )}

      {selected && text ? (
        <pre className="log" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>
          {text}
        </pre>
      ) : null}
    </div>
  )
}
