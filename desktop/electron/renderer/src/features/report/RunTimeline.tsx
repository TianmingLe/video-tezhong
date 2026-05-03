import { useCallback, useEffect, useMemo, useState } from 'react'

type Props = {
  runId: string
}

type Ev = { ts: number; type: string; [k: string]: unknown }

function parseJsonl(text: string): Ev[] {
  const out: Ev[] = []
  for (const line of String(text || '').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const obj = JSON.parse(t) as any
      if (obj && typeof obj.ts === 'number' && typeof obj.type === 'string') out.push(obj)
    } catch {}
  }
  out.sort((a, b) => a.ts - b.ts)
  return out
}

export function RunTimeline(props: Props) {
  const rid = props.runId
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<Ev[]>([])

  const load = useCallback(async () => {
    if (!rid) return
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.job.readRunFile(rid, 'events.jsonl', 512 * 1024)
      if (!res.success) throw new Error(res.error)
      setEvents(parseJsonl(res.text))
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [rid])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    if (events.length === 0) return null
    const start = events[0]?.ts ?? 0
    const end = events[events.length - 1]?.ts ?? start
    const duration = Math.max(0, end - start)
    return { start, end, duration }
  }, [events])

  return (
    <div className="card">
      <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600 }}>时间轴</div>
        <button type="button" className="btn" onClick={load} disabled={!rid || loading}>
          刷新
        </button>
        {summary ? (
          <div style={{ opacity: 0.75 }}>
            {new Date(summary.start).toLocaleString()} → {new Date(summary.end).toLocaleString()} ({Math.round(summary.duration / 1000)}s)
          </div>
        ) : null}
      </div>

      {error ? <div className="error">{error}</div> : null}

      {events.length === 0 ? (
        <div className="row" style={{ opacity: 0.7 }}>
          {loading ? '加载中…' : '未找到 events.jsonl'}
        </div>
      ) : (
        <div className="row">
          <div style={{ display: 'grid', gap: 6 }}>
            {events.slice(-120).map((ev, idx) => (
              <div key={idx} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                {new Date(ev.ts).toLocaleTimeString()} [{ev.type}] {ev.line ? String(ev.line) : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

