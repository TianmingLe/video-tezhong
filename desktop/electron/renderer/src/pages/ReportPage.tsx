import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import type { JobStatusEvent } from '../../../preload/types'
import { RetryButton } from '../components/RetryButton'
import { Skeleton } from '../components/Skeleton'
import { LogViewer } from '../features/task/LogViewer'
import { MAX_UI_LOG_LINES } from '../features/task/logBuffer'
import { parseLogLine } from '../features/task/logUtils'
import type { LogItem } from '../features/task/logTypes'

type ReportNavState = {
  exitCode: number | null
  signal: string | null
  scenario: string
  script: string
  startedAt: number
  endedAt: number
}

const INITIAL_LOG_LINES = 500
const DEFAULT_CHUNK_SIZE = 64 * 1024

export function ReportPage() {
  const { runId } = useParams()
  const rid = runId || ''
  const loc = useLocation()
  const nav = (loc.state || null) as ReportNavState | null
  const [status, setStatus] = useState<JobStatusEvent | null>(null)
  const [logs, setLogs] = useState<LogItem[]>([])
  const [initLoading, setInitLoading] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [eof, setEof] = useState(false)

  const offsetRef = useRef(0)
  const carryRef = useRef('')
  const loadSeqRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const pullTimerRef = useRef<number | null>(null)
  const nextIdRef = useRef(0)

  const appendLines = (lines: string[]): number => {
    const cleaned = lines.map((x) => x.replace(/\r$/, '')).filter((x) => x.trim() !== '')
    if (cleaned.length === 0) return 0
    setLogs((prev) => {
      let nextId = nextIdRef.current
      const next = cleaned.map((line) => {
        const item = parseLogLine(line, nextId)
        nextId += 1
        return item
      })
      nextIdRef.current = nextId
      const merged = [...prev, ...next]
      return merged.length > MAX_UI_LOG_LINES ? merged.slice(-MAX_UI_LOG_LINES) : merged
    })
    return cleaned.length
  }

  const parseChunkText = (text: string, chunkEof: boolean): string[] => {
    const merged = carryRef.current + String(text || '')
    const parts = merged.split('\n')
    const last = parts.pop() ?? ''
    if (chunkEof) {
      carryRef.current = ''
      if (last.trim() !== '') parts.push(last)
    } else {
      carryRef.current = last
    }
    return parts
  }

  const loadNextChunk = async (): Promise<{ eof: boolean; advanced: boolean; appended: number }> => {
    const res = await window.api.job.getArchivedLog(rid, offsetRef.current, DEFAULT_CHUNK_SIZE)
    if (!res.success) throw new Error(res.error)
    const before = offsetRef.current
    offsetRef.current = res.nextOffset
    setEof(res.eof)
    const lines = parseChunkText(res.text, res.eof)
    const appended = appendLines(lines)
    return { eof: res.eof, advanced: res.nextOffset !== before || res.text.length > 0, appended }
  }

  useEffect(() => {
    if (!rid) return
    const offStatus = window.api.job.onStatus(rid, (ev) => setStatus(ev))
    return () => {
      offStatus()
    }
  }, [rid])

  const loadInitial = async () => {
    if (!rid) return
    loadSeqRef.current += 1
    const seq = loadSeqRef.current

    setInitLoading(true)
    setInitError(null)
    setLoadMoreError(null)
    setLoadingMore(false)
    setEof(false)

    offsetRef.current = 0
    carryRef.current = ''
    nextIdRef.current = 0
    setLogs([])

    try {
      let count = 0
      while (count < INITIAL_LOG_LINES) {
        if (seq !== loadSeqRef.current) return
        const r = await loadNextChunk()
        if (seq !== loadSeqRef.current) return
        count += r.appended
        if (r.eof) break
        if (!r.advanced) break
        if (r.appended === 0) break
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      setInitError(String((e as Error)?.message || e))
    } finally {
      if (seq !== loadSeqRef.current) return
      setInitLoading(false)
    }
  }

  const loadMore = async () => {
    if (!rid) return
    if (loadingMoreRef.current) return
    const seq = loadSeqRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      await loadNextChunk()
    } catch (e) {
      if (seq === loadSeqRef.current) setLoadMoreError(String((e as Error)?.message || e))
    } finally {
      loadingMoreRef.current = false
      if (seq === loadSeqRef.current) setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!rid) return
    void loadInitial()
    return () => {
      loadSeqRef.current += 1
    }
  }, [rid])

  useEffect(() => {
    if (!rid) return
    if (status?.status !== 'started') return
    const off = window.api.job.onLog(rid, () => {
      if (pullTimerRef.current != null) return
      pullTimerRef.current = window.setTimeout(() => {
        pullTimerRef.current = null
        void loadMore()
      }, 180)
    })
    return () => {
      off()
      if (pullTimerRef.current != null) {
        window.clearTimeout(pullTimerRef.current)
        pullTimerRef.current = null
      }
    }
  }, [rid, status?.status])

  const summary = useMemo(() => {
    const out: LogItem[] = []
    for (const it of logs) {
      if (it.kind === 'json') {
        const m = it.msg.toLowerCase()
        if (m.includes('session') || m.includes('result') || m.includes('error')) out.push(it)
      }
    }
    return out.slice(-80)
  }, [logs])

  const exportLog = async () => {
    if (!rid) return
    await window.api.job.exportLog(rid)
  }

  const statusLabel = status?.status ?? (nav ? 'exited' : 'unknown')
  const hasMore = !eof || status?.status === 'started'
  const noLog = !initLoading && !initError && logs.length === 0 && eof

  return (
    <div className="page">
      <h1 className="page-title">报告</h1>
      <p className="page-subtitle">RunID: {rid}</p>

      <div className="card">
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={exportLog}>
            导出完整日志 (.log)
          </button>
          <div className="muted">状态: {statusLabel}</div>
          {nav && (
            <>
              <div className="muted">脚本: {nav.script}</div>
              <div className="muted">场景: {nav.scenario}</div>
              <div className="muted">退出码: {nav.exitCode ?? '-'}</div>
              <div className="muted">耗时: {Math.round((nav.endedAt - nav.startedAt) / 1000)}s</div>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row">
          <div className="label">关键事件摘要</div>
        </div>
        <pre className="console">{summary.map((it) => (it.kind === 'json' ? it.msg : it.raw)).join('\n')}</pre>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="label">日志</div>
          {!initLoading && !initError && <div className="muted">已加载 {logs.length} 行</div>}
        </div>

        {initLoading ? (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} />
          </div>
        ) : initError ? (
          <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <div className="muted">读取日志失败：{initError}</div>
            <RetryButton label="重试" onRetry={loadInitial} />
          </div>
        ) : noLog ? (
          <div className="muted" style={{ marginTop: 10 }}>
            无日志
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            <LogViewer items={logs} hasMore={hasMore} loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={loadMore} />
          </div>
        )}
      </div>
    </div>
  )
}
