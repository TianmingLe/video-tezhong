import { Outlet } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import './shell.css'

export function AppShell() {
  return (
    <div className="shell">
      <SidebarNav />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

