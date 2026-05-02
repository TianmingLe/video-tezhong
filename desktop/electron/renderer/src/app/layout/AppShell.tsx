import { Outlet } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import './shell.css'
import { useAppNavigate } from '../useAppNavigate'
import { useEffect } from 'react'
import { QueueStatusProvider, useQueueStatus } from '../../contexts/QueueStatusContext'

export function AppShell() {
  useAppNavigate()
  return (
    <QueueStatusProvider>
      <AppShellBody />
    </QueueStatusProvider>
  )
}

function AppShellBody() {
  const { setStatus, setLoading } = useQueueStatus()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.job
      .queueStatus()
      .then((snap) => {
        if (cancelled) return
        setStatus(snap)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    const off = window.api.job.onQueueUpdate((snap) => {
      if (cancelled) return
      setStatus(snap)
    })

    return () => {
      cancelled = true
      off()
    }
  }, [setLoading, setStatus])

  return (
    <div className="shell">
      <SidebarNav />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
