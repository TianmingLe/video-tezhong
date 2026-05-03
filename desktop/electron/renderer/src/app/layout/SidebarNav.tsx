import { NavLink } from 'react-router-dom'

const items: Array<{ to: string; label: string }> = [
  { to: '/tasks', label: '任务' },
  { to: '/console', label: '控制台' },
  { to: '/reports', label: '报告' },
  { to: '/cluster', label: '聚类' },
  { to: '/kb', label: '知识库' },
  { to: '/settings', label: '设置' }
]

export function SidebarNav() {
  return (
    <aside className="nav">
      <div className="brand">
        <div className="brand-title">OmniScraper</div>
        <div className="brand-subtitle">Desktop</div>
      </div>
      <div className="nav-items">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) => (isActive ? 'nav-item nav-item-active' : 'nav-item')}
          >
            <span className="nav-item-label">{it.label}</span>
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
