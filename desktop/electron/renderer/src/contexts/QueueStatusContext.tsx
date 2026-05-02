import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { JobQueueStatus } from '../../../preload/types'

export type QueueStatusContextValue = {
  status: JobQueueStatus | null
  loading: boolean
  setStatus: (next: JobQueueStatus) => void
  setLoading: (next: boolean) => void
}

const QueueStatusContext = createContext<QueueStatusContextValue | null>(null)

export function QueueStatusProvider(props: { children: ReactNode }) {
  const [status, setStatus] = useState<JobQueueStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const value = useMemo<QueueStatusContextValue>(() => {
    return {
      status,
      loading,
      setStatus,
      setLoading
    }
  }, [status, loading])

  return <QueueStatusContext.Provider value={value}>{props.children}</QueueStatusContext.Provider>
}

export function useQueueStatus(): QueueStatusContextValue {
  const ctx = useContext(QueueStatusContext)
  if (!ctx) throw new Error('useQueueStatus must be used within QueueStatusProvider')
  return ctx
}
