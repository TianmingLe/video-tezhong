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

  return (
    <div className="card" style={props.style}>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: 6, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontWeight: 600 }}>
              Running {props.loading ? '-' : running}/{max}
            </div>
            <span className="queue-badge">Pending {props.loading ? '-' : pending}</span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.08)'
            }}
            aria-label="queue-running-progress"
          >
            <div
              style={{
                width: `${ratio * 100}%`,
                height: '100%',
                background: 'rgba(131, 170, 255, 0.65)'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
