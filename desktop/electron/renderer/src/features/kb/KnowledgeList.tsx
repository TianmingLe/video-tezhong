import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ConfigRecord } from '../../../../preload/types'

export function KnowledgeList() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [items, setItems] = useState<ConfigRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.kb
      .list()
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

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return items
    return items.filter((it) => {
      const hay = `${it.name} ${it.script} ${it.scenario}`.toLowerCase()
      return hay.includes(kw)
    })
  }, [q, items])

  const parseEnv = (raw: string) => {
    const s = String(raw || '').trim()
    if (!s) return {}
    try {
      const o = JSON.parse(s) as unknown
      if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const key = String(k || '').trim()
        if (!key) continue
        out[key] = String(v ?? '')
      }
      return out
    } catch {
      return {}
    }
  }

  return (
    <div className="card">
      <div className="row">
        <input className="input" placeholder="搜索（名称/脚本/场景）" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="list">
        {loading ? (
          <div className="muted">加载中...</div>
        ) : list.length === 0 ? (
          <div className="muted">暂无模板</div>
        ) : (
          list.map((it) => (
            <button
              key={it.id}
              type="button"
              className="list-item"
              onClick={() => {
                sessionStorage.setItem(
                  'taskPreset',
                  JSON.stringify({
                    script: it.script,
                    scenario: it.scenario,
                    gatewayWs: it.gateway_ws,
                    env: parseEnv(it.env)
                  })
                )
                navigate('/tasks')
              }}
            >
              <div className="list-title">
                {it.name}
                {it.is_default === 1 ? <span className="muted">（默认）</span> : null}
              </div>
              <div className="list-subtitle">
                {it.script} · {it.scenario}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
