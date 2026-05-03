import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TaskConfig } from './configSchema'
import { TaskConfigForm } from './TaskConfigForm'
import { LogViewer } from './LogViewer'
import { MAX_UI_LOG_LINES } from './logBuffer'
import { parseLogLine } from './logUtils'
import type { LogItem } from './logTypes'
import type { JobStatusEvent } from '../../../../preload/types'

type Status = 'idle' | 'running' | 'exited' | 'error'

type ReportNavState = {
  exitCode: number | null
  signal: string | null
  scenario: string
  script: string
  startedAt: number
  endedAt: number
}

export function TaskController(props: { initial?: Partial<TaskConfig>; onConfigCommitted?: (cfg: TaskConfig) => void }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('idle')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [items, setItems] = useState<LogItem[]>([])
  const startedAtRef = useRef<number>(0)
  const nextIdRef = useRef(0)
  const lastCfgRef = useRef<TaskConfig | null>(null)
  const offLogRef = useRef<(() => void) | null>(null)
  const offStatusRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      offLogRef.current?.()
      offStatusRef.current?.()
      offLogRef.current = null
      offStatusRef.current = null
    }
  }, [])

  const defaultValues = useMemo(() => {
    if (props.initial) return props.initial
    return lastCfgRef.current ?? undefined
  }, [props.initial])

  const resetSubscriptions = () => {
    offLogRef.current?.()
    offStatusRef.current?.()
    offLogRef.current = null
    offStatusRef.current = null
  }

  const onSubmit = async (cfg: TaskConfig) => {
    resetSubscriptions()
    lastCfgRef.current = cfg
    props.onConfigCommitted?.(cfg)

    const runId = cfg.runId
    startedAtRef.current = Date.now()
    nextIdRef.current = 0
    setActiveRunId(runId)
    setItems([])
    setStatus('running')

    offLogRef.current = window.api.job.onLog(runId, (line) => {
      setItems((prev) => {
        const item = parseLogLine(line, nextIdRef.current)
        nextIdRef.current += 1
        const next = [...prev, item]
        return next.length > MAX_UI_LOG_LINES ? next.slice(-MAX_UI_LOG_LINES) : next
      })
    })

    offStatusRef.current = window.api.job.onStatus(runId, (ev: JobStatusEvent) => {
      if (ev.status === 'error') setStatus('error')
      if (ev.status === 'exited') {
        setStatus('exited')
        resetSubscriptions()
        if (cfg.advanced.autoJumpToReport) {
          const endedAt = Date.now()
          const navState: ReportNavState = {
            exitCode: ev.code,
            signal: ev.signal,
            scenario: cfg.scenario,
            script: cfg.script,
            startedAt: startedAtRef.current,
            endedAt
          }
          setTimeout(() => navigate(`/report/${runId}`, { state: navState }), 500)
        }
      }
    })

    const timeoutMs = cfg.limits?.timeoutMs ?? 0
    const maxAttempts = cfg.retry?.maxAttempts ?? 1

    const res =
      cfg.script === 'mediacrawler'
        ? await window.api.job.start({
            runId,
            script: 'mediacrawler',
            args: [],
            env: cfg.env,
            payload: {
              kind: cfg.mediacrawler?.kind,
              runId,
              args:
                cfg.mediacrawler?.kind === 'dy_mvp'
                  ? {
                      specifiedId: (cfg.mediacrawler as any).specifiedId,
                      enableLlm: (cfg.mediacrawler as any).enableLlm
                    }
                  : cfg.mediacrawler?.kind === 'xhs_search' || cfg.mediacrawler?.kind === 'bili_search'
                    ? {
                        keywords: (cfg.mediacrawler as any).keywords,
                        limit: (cfg.mediacrawler as any).limit,
                        enableLlm: (cfg.mediacrawler as any).enableLlm
                      }
                    : {}
            },
            maxAttempts,
            timeoutMs
          })
        : await window.api.job.start({
            runId,
            script: `scripts/${cfg.script}`,
            args: ['--scenario', cfg.scenario, '--trace-id', runId],
            env: cfg.env,
            maxAttempts,
            timeoutMs
          })
    if (!res.success) {
      resetSubscriptions()
      setStatus('error')
      setItems((prev) => {
        const item = parseLogLine(`ERROR: ${res.error}`, nextIdRef.current)
        nextIdRef.current += 1
        const next = [...prev, item]
        return next.length > MAX_UI_LOG_LINES ? next.slice(-MAX_UI_LOG_LINES) : next
      })
    }
  }

  const canCancel = status === 'running' && activeRunId

  const cancel = async () => {
    if (!activeRunId) return
    await window.api.job.cancel(activeRunId)
  }

  const durationMs = useMemo(() => {
    if (!startedAtRef.current) return 0
    return Date.now() - startedAtRef.current
  }, [status])

  return (
    <div className="grid">
      <div>
        <TaskConfigForm onSubmit={onSubmit} defaultValues={defaultValues} />
        <div className="row" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn" disabled={!canCancel} onClick={cancel}>
            取消
          </button>
          <div className="muted">
            状态: {status} 耗时: {Math.round(durationMs / 1000)}s
          </div>
        </div>
      </div>
      <div>
        <LogViewer items={items} />
      </div>
    </div>
  )
}
