import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type DbStateContextValue = {
  isReadOnly: boolean
  loading: boolean
  setIsReadOnly: (next: boolean) => void
  setLoading: (next: boolean) => void
}

const DbStateContext = createContext<DbStateContextValue | null>(null)

export function DbStateProvider(props: { children: ReactNode }) {
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [loading, setLoading] = useState(true)

  const value = useMemo<DbStateContextValue>(() => {
    return { isReadOnly, loading, setIsReadOnly, setLoading }
  }, [isReadOnly, loading])

  return <DbStateContext.Provider value={value}>{props.children}</DbStateContext.Provider>
}

export function useDbState(): DbStateContextValue {
  const ctx = useContext(DbStateContext)
  if (!ctx) throw new Error('useDbState must be used within DbStateProvider')
  return ctx
}

