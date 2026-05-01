import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function attachAppNavigate(onNavigate: (cb: (ev: { path: string }) => void) => () => void, navigate: (path: string) => void) {
  return onNavigate((ev) => navigate(ev.path))
}

export function useAppNavigate() {
  const navigate = useNavigate()
  useEffect(() => {
    const off = attachAppNavigate(window.api.app.onNavigate, navigate)
    return () => off()
  }, [navigate])
}

