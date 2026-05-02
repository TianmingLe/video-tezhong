import { parseLogLine } from './logUtils'
import type { LogItem } from './logTypes'

export const MAX_UI_LOG_LINES = 10000

export type LogBuffer = {
  appendLine: (line: string) => LogItem
  appendLines: (lines: string[]) => LogItem[]
  getItems: () => LogItem[]
  getNextId: () => number
  clear: () => void
}

export function createLogBuffer(args?: { maxLines?: number; initialNextId?: number }): LogBuffer {
  const maxLines = typeof args?.maxLines === 'number' ? args.maxLines : MAX_UI_LOG_LINES
  let nextId = typeof args?.initialNextId === 'number' ? args.initialNextId : 0
  let items: LogItem[] = []

  const compact = () => {
    if (items.length <= maxLines) return
    items = items.slice(-maxLines)
  }

  const appendLine = (line: string): LogItem => {
    const item = parseLogLine(line, nextId)
    nextId += 1
    items = [...items, item]
    compact()
    return item
  }

  const appendLines = (lines: string[]): LogItem[] => {
    const out: LogItem[] = []
    for (const line of lines) out.push(appendLine(line))
    return out
  }

  const getItems = () => items
  const getNextId = () => nextId
  const clear = () => {
    items = []
    nextId = typeof args?.initialNextId === 'number' ? args.initialNextId : 0
  }

  return { appendLine, appendLines, getItems, getNextId, clear }
}

