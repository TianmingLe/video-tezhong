import { expect, test } from 'vitest'
import { createLogBuffer } from './logBuffer'

test('logBuffer: caps length and keeps newest ids', () => {
  const buf = createLogBuffer({ maxLines: 5 })
  buf.appendLines(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'])

  const items = buf.getItems()
  expect(items.length).toBe(5)
  expect(items.map((x) => x.id)).toEqual([2, 3, 4, 5, 6])
  expect(items[0]?.kind).toBe('text')
  expect(items[0]?.raw).toBe('a2')
  expect(buf.getNextId()).toBe(7)
})

test('logBuffer: ids remain strictly increasing after truncation', () => {
  const buf = createLogBuffer({ maxLines: 3 })
  buf.appendLines(['x0', 'x1', 'x2', 'x3', 'x4'])
  buf.appendLine('x5')

  const items = buf.getItems()
  expect(items.map((x) => x.id)).toEqual([3, 4, 5])
  expect(buf.getNextId()).toBe(6)
})

test('logBuffer: instances are isolated (no shared counter)', () => {
  const a = createLogBuffer({ maxLines: 3 })
  const b = createLogBuffer({ maxLines: 3 })

  a.appendLines(['a0', 'a1'])
  b.appendLine('b0')
  a.appendLines(['a2', 'a3', 'a4'])

  expect(b.getItems().map((x) => x.id)).toEqual([0])
  expect(a.getItems().map((x) => x.id)).toEqual([2, 3, 4])
  expect(a.getNextId()).toBe(5)
  expect(b.getNextId()).toBe(1)
})

