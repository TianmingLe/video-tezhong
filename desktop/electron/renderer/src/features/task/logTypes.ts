export type LogLevel = 'info' | 'warn' | 'error'

export type LogItem =
  | { id: number; kind: 'text'; raw: string; ts: number }
  | { id: number; kind: 'json'; raw: string; ts: number; level: LogLevel; msg: string; traceId?: string }

export type LogFilter = {
  level: 'all' | LogLevel
  keyword: string
}

