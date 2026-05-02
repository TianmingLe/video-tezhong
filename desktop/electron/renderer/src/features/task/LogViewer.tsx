import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogFilter, LogItem } from './logTypes'
import { filterLogs } from './logUtils'
import { Skeleton } from '../../components/Skeleton'

export type LogViewerProps = {
  items: LogItem[]
  hasMore?: boolean
  loadingMore?: boolean
  loadMoreError?: string | null
  onLoadMore?: () => void
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return v
}

export function LogViewer(props: LogViewerProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const lastLoadMoreAtRef = useRef(0)
  const [level, setLevel] = useState<LogFilter['level']>('all')
  const [keywordRaw, setKeywordRaw] = useState('')
  const keyword = useDebouncedValue(keywordRaw, 200)
  const [follow, setFollow] = useState(true)
  const [newCount, setNewCount] = useState(0)

  const filter = useMemo<LogFilter>(() => ({ level, keyword }), [level, keyword])
  const filtered = useMemo(() => filterLogs(props.items, filter), [props.items, filter])

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 18,
    getItemKey: (index) => filtered[index]?.id ?? index,
    overscan: 20
  })

  useEffect(() => {
    if (!follow) {
      setNewCount((c) => c + 1)
      return
    }
    setNewCount(0)
    if (filtered.length > 0) rowVirtualizer.scrollToIndex(filtered.length - 1, { align: 'end' })
  }, [filtered.length, follow])

  const maybeLoadMore = () => {
    if (!props.onLoadMore) return
    if (props.loadingMore) return
    if (props.loadMoreError) return
    if (props.hasMore === false) return
    const now = Date.now()
    if (now - lastLoadMoreAtRef.current < 600) return
    lastLoadMoreAtRef.current = now
    props.onLoadMore()
  }

  const onScroll = () => {
    const el = parentRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distanceToBottom < 20
    const nearBottomForLoadMore = distanceToBottom < 240
    if (nearBottom) {
      setFollow(true)
      setNewCount(0)
    } else {
      setFollow(false)
    }
    if (nearBottomForLoadMore) maybeLoadMore()
  }

  return (
    <div className="card">
      <div className="toolbar">
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value as LogFilter['level'])}>
          <option value="all">all</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <input className="input" placeholder="搜索" value={keywordRaw} onChange={(e) => setKeywordRaw(e.target.value)} />
        {!follow && (
          <button
            type="button"
            className="badge"
            onClick={() => {
              setFollow(true)
              setNewCount(0)
              if (filtered.length > 0) rowVirtualizer.scrollToIndex(filtered.length - 1, { align: 'end' })
            }}
          >
            新日志 {newCount}
          </button>
        )}
      </div>

      <div className="log-viewport" ref={parentRef} onScroll={onScroll}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((v) => {
            const item = filtered[v.index]
            const top = v.start
            return (
              <div
                key={v.key}
                className={item?.kind === 'json' ? `log-line log-${item.level}` : 'log-line'}
                style={{ position: 'absolute', top, left: 0, right: 0 }}
              >
                {renderLine(item)}
              </div>
            )
          })}
        </div>
      </div>

      {(props.loadingMore || props.loadMoreError || props.hasMore === false) && (
        <div className="row" style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {props.loadingMore ? (
            <Skeleton height={14} />
          ) : props.loadMoreError ? (
            <>
              <div className="muted">加载失败：{props.loadMoreError}</div>
              <button type="button" className="btn" onClick={() => props.onLoadMore?.()}>
                重试
              </button>
            </>
          ) : (
            <div className="muted">已到末尾</div>
          )}
        </div>
      )}
    </div>
  )
}

function renderLine(it: LogItem | undefined) {
  if (!it) return null
  if (it.kind === 'text') return it.raw
  return it.msg
}
