import { useSyncExternalStore } from 'react'
import { toastStore } from './toastStore'

export function ToastHost() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, toastStore.getSnapshot)

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast card" role="status">
          <div className="toast-body">
            {t.title ? <div className="toast-title">{t.title}</div> : null}
            <div className="toast-message muted">{t.message}</div>
            {t.actions && t.actions.length ? (
              <div className="toast-actions">
                {t.actions.map((a) => (
                  <button key={a.label} type="button" className="btn" onClick={a.onClick}>
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {t.dismissible === false ? null : (
            <button type="button" className="btn toast-close" onClick={() => toastStore.dismiss(t.id)} aria-label="关闭">
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

