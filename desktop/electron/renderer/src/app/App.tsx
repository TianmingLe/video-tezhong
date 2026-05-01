import { useMemo, useState } from 'react'
import { NavKey, navItems } from './nav'
import { TasksPage } from '../pages/TasksPage'
import { ConsolePage } from '../pages/ConsolePage'
import { ReportsPage } from '../pages/ReportsPage'
import { KnowledgeBasePage } from '../pages/KnowledgeBasePage'
import { SettingsPage } from '../pages/SettingsPage'

export function App() {
  const [active, setActive] = useState<NavKey>('tasks')

  const content = useMemo(() => {
    if (active === 'tasks') return <TasksPage />
    if (active === 'console') return <ConsolePage />
    if (active === 'reports') return <ReportsPage />
    if (active === 'kb') return <KnowledgeBasePage />
    return <SettingsPage />
  }, [active])

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand">
          <div className="brand-title">OmniScraper</div>
          <div className="brand-subtitle">Desktop</div>
        </div>
        <div className="nav-items">
          {navItems.map((it) => (
            <button
              key={it.key}
              className={it.key === active ? 'nav-item nav-item-active' : 'nav-item'}
              onClick={() => setActive(it.key)}
              type="button"
            >
              <span className="nav-item-label">{it.label}</span>
            </button>
          ))}
        </div>
      </aside>
      <main className="main">{content}</main>
    </div>
  )
}

