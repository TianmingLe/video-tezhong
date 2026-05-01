import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mockKnowledge } from './mockKnowledge'

export function KnowledgeList() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return mockKnowledge
    return mockKnowledge.filter((it) => {
      const hay = `${it.title} ${it.tags.join(' ')}`.toLowerCase()
      return hay.includes(kw)
    })
  }, [q])

  return (
    <div className="card">
      <div className="row">
        <input className="input" placeholder="搜索（标题/标签）" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="list">
        {list.map((it) => (
          <button
            key={it.id}
            type="button"
            className="list-item"
            onClick={() => {
              sessionStorage.setItem('taskPreset', JSON.stringify({ script: it.preset.script, scenario: it.preset.scenario }))
              navigate('/tasks')
            }}
          >
            <div className="list-title">{it.title}</div>
            <div className="list-subtitle">{it.tags.join(', ')}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

