import type { LogFilter, LogItem, LogLevel } from './logTypes'

export function parseLogLine(line: string, id: number): LogItem {
  const raw = String(line || '')
  const ts = Date.now()
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') {
      const anyObj = obj as Record<string, unknown>
      const level = String(anyObj.level || 'info') as LogLevel
      const msg = String(anyObj.msg || anyObj.message || raw)
      const traceId = typeof anyObj.trace_id === 'string' ? anyObj.trace_id : undefined
      if (level === 'info' || level === 'warn' || level === 'error') {
        return { id, kind: 'json', raw, ts, level, msg, traceId }
      }
    }
  } catch {}
  return { id, kind: 'text', raw, ts }
}

export function filterLogs(items: LogItem[], filter: LogFilter): LogItem[] {
  const kw = filter.keyword.trim().toLowerCase()
  return items.filter((it) => {
    if (filter.level !== 'all' && it.kind === 'json' && it.level !== filter.level) return false
    if (!kw) return true
    const hay = it.kind === 'json' ? `${it.msg} ${it.raw}` : it.raw
    return hay.toLowerCase().includes(kw)
  })
}

