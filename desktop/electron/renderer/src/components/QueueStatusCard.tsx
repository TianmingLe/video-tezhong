import type { CSSProperties } from 'react'
import type { JobQueueStatus } from '../../../preload/types'

export type QueueStatusCardProps = {
  status: JobQueueStatus | null
  loading?: boolean
  maxConcurrency?: number
  style?: CSSProperties
}

export function QueueStatusCard(props: QueueStatusCardProps) {
  const max = typeof props.maxConcurrency === 'number' ? props.maxConcurrency : 2
  const running = props.status?.running?.length ?? 0
  const pending = props.status?.pending ?? 0
  const ratio = max > 0 ? Math.min(1, Math.max(0, running / max)) : 0

  const getStatusColor = () => {
    if (ratio === 0) return 'var(--text-muted)'
    if (ratio >= 1) return 'var(--accent-warning)'
    return 'var(--accent-primary)'
  }

  const runningDisplay = props.loading ? '-' : running
  const pendingDisplay = props.loading ? '-' : pending

  return (
    <div className="card" style={props.style}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: running > 0 ? 'var(--accent-success)' : 'var(--text-muted)',
            boxShadow: running > 0 ? '0 0 8px var(--accent-success)' : 'none',
            animation: running > 0 ? 'queue-pulse 2s infinite' : 'none'
          }} />
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              Running <span style={{ color: getStatusColor() }}>{runningDisplay}</span>/{max}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              Pending: {pendingDisplay}
            </div>
          </div>
        </div>
        <span className="queue-badge">队列状态</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.06)',
          marginTop: 12
        }}
        aria-label="queue-running-progress"
      >
        <div
          data-testid="progress-bar"
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            background: `linear-gradient(90deg, var(--accent-primary), ${ratio >= 1 ? 'var(--accent-warning)' : 'var(--accent-secondary)'})`,
            transition: 'width 300ms ease'
          }}
        />
      </div>
      <style>{`
        @keyframes queue-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
