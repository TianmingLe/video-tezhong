import { expect, test } from 'vitest'
import { parseLogLine, filterLogs } from './logUtils'

test('parseLogLine parses json', () => {
  const line = JSON.stringify({ ts: 1, level: 'warn', msg: 'x' })
  const r = parseLogLine(line, 0)
  expect(r.kind).toBe('json')
  if (r.kind !== 'json') throw new Error('not json')
  expect(r.level).toBe('warn')
})

test('parseLogLine falls back to text', () => {
  const r = parseLogLine('hello', 0)
  expect(r.kind).toBe('text')
})

test('filterLogs filters by level and keyword', () => {
  const logs = [
    parseLogLine(JSON.stringify({ level: 'info', msg: 'a' }), 0),
    parseLogLine(JSON.stringify({ level: 'error', msg: 'boom' }), 1)
  ]
  const r1 = filterLogs(logs, { level: 'error', keyword: '' })
  expect(r1.length).toBe(1)
  const r2 = filterLogs(logs, { level: 'all', keyword: 'boom' })
  expect(r2.length).toBe(1)
})

