import { Outlet } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import './shell.css'
import { useAppNavigate } from '../useAppNavigate'
import { useEffect } from 'react'
import { QueueStatusProvider, useQueueStatus } from '../../contexts/QueueStatusContext'
import { DbStateProvider, useDbState } from '../../contexts/DbStateContext'
import { ToastHost } from '../../components/toast/ToastHost'
import { UpdateToastHost } from '../../components/toast/UpdateToastHost'

export function AppShell() {
  useAppNavigate()
  return (
    <QueueStatusProvider>
      <DbStateProvider>
        <AppShellBody />
      </DbStateProvider>
    </QueueStatusProvider>
  )
}

function AppShellBody() {
  const { setStatus, setLoading } = useQueueStatus()
  const { setIsReadOnly, setLoading: setDbLoading } = useDbState()

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

  useEffect(() => {
    let cancelled = false
    setDbLoading(true)
    window.api.app
      .getDbState()
      .then((s) => {
        if (cancelled) return
        setIsReadOnly(!!s?.isReadOnly)
      })
      .finally(() => {
        if (cancelled) return
        setDbLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [setDbLoading, setIsReadOnly])

  return (
    <div className="shell">
      <SidebarNav />
      <main className="main">
        <Outlet />
        <UpdateToastHost />
        <ToastHost />
      </main>
    </div>
  )
}
