import { useSyncExternalStore } from 'react'
import { toastStore } from './toastStore'

type ToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const icons: Record<ToastVariant, JSX.Element> = {
    default: (
      <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    success: (
      <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
    warning: (
      <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    error: (
      <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    info: (
      <svg className="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    )
  }
  return icons[variant]
}

function inferVariant(title?: string | null): ToastVariant {
  if (!title) return 'default'
  const t = title.toLowerCase()
  if (t.includes('成功') || t.includes('已保存') || t.includes('完成')) return 'success'
  if (t.includes('失败') || t.includes('错误') || t.includes('删除')) return 'error'
  if (t.includes('警告') || t.includes('警告')) return 'warning'
  if (t.includes('更新') || t.includes('诊断') || t.includes('检查')) return 'info'
  return 'default'
}

export function ToastHost() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, toastStore.getSnapshot)

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((t, index) => {
        const variant = inferVariant(t.title)
        return (
          <div
            key={t.id}
            className={`toast toast-${variant}`}
            role="status"
            style={{
              animationDelay: `${index * 50}ms`,
              borderLeft: `3px solid var(--accent-${variant === 'default' ? 'primary' : variant})`
            }}
          >
            <ToastIcon variant={variant} />
            <div className="toast-body">
              {t.title ? <div className="toast-title">{t.title}</div> : null}
              <div className="toast-message muted">{t.message}</div>
              {t.actions && t.actions.length ? (
                <div className="toast-actions">
                  {t.actions.map((a) => (
                    <button key={a.label} type="button" className="btn btn-sm" onClick={a.onClick}>
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {t.dismissible === false ? null : (
              <button
                type="button"
                className="btn toast-close"
                onClick={() => toastStore.dismiss(t.id)}
                aria-label="关闭"
                style={{ opacity: 0.5 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
