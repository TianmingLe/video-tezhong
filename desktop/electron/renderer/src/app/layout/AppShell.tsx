import { Outlet } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import './shell.css'
import { useAppNavigate } from '../useAppNavigate'

export function AppShell() {
  useAppNavigate()
  return (
    <div className="shell">
      <SidebarNav />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
