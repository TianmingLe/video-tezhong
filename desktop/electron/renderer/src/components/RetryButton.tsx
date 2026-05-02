import { useEffect, useRef, useState } from 'react'

export type RetrySnapshot = {
  status: 'idle' | 'loading' | 'error'
  error: string | null
}

export type RetryController = {
  getSnapshot: () => RetrySnapshot
  retry: () => Promise<void>
}

export function createRetryController(args: { onRetry: () => Promise<void>; onSnapshot: (s: RetrySnapshot) => void }): RetryController {
  let snapshot: RetrySnapshot = { status: 'idle', error: null }

  const setSnapshot = (next: RetrySnapshot) => {
    snapshot = next
    args.onSnapshot(next)
  }

  const retry = async () => {
    if (snapshot.status === 'loading') return
    setSnapshot({ status: 'loading', error: null })
    try {
      await args.onRetry()
      setSnapshot({ status: 'idle', error: null })
    } catch (e) {
      setSnapshot({ status: 'error', error: String((e as Error)?.message || e) })
    }
  }

  return { getSnapshot: () => snapshot, retry }
}

export type RetryButtonProps = {
  label: string
  onRetry: () => Promise<void>
}

export function RetryButton(props: RetryButtonProps) {
  const onRetryRef = useRef(props.onRetry)
  useEffect(() => {
    onRetryRef.current = props.onRetry
  }, [props.onRetry])

  const [snap, setSnap] = useState<RetrySnapshot>({ status: 'idle', error: null })
  const ctrlRef = useRef<RetryController | null>(null)

  if (!ctrlRef.current) {
    ctrlRef.current = createRetryController({
      onRetry: async () => await onRetryRef.current(),
      onSnapshot: setSnap
    })
  }

  const buttonLabel = snap.status === 'loading' ? `${props.label}中...` : props.label

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {snap.status === 'error' ? <div className="muted">失败：{snap.error}</div> : null}
      <button type="button" className="btn" disabled={snap.status === 'loading'} onClick={() => void ctrlRef.current?.retry()}>
        {buttonLabel}
      </button>
    </div>
  )
}

