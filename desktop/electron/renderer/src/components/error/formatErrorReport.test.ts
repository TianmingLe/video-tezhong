import { expect, test } from 'vitest'
import { formatErrorReport } from './formatErrorReport'

test('formatErrorReport: missing appVersion/platform/href fall back to unknown', () => {
  const out = formatErrorReport({ error: new Error('boom') })
  expect(out).toContain('appVersion: unknown')
  expect(out).toContain('platform: unknown')
  expect(out).toContain('href: unknown')
})

test('formatErrorReport: supports string error', () => {
  const out = formatErrorReport({ error: 'boom' })
  expect(out).toContain('errorMessage: boom')
})

test('formatErrorReport: long stack is truncated with marker', () => {
  const err = new Error('x')
  err.stack = `Error: x\nprefix\n${'x'.repeat(200)}\nsuffix`
  const out = formatErrorReport({ error: err, maxStackChars: 40 })
  expect(out).toContain('prefix')
  expect(out).toContain('(truncated)')
  expect(out).not.toContain('suffix')
})

test('formatErrorReport: includes componentStack when provided', () => {
  const out = formatErrorReport({ error: new Error('boom'), componentStack: '\n at Foo\n' })
  expect(out).toContain('componentStack:')
  expect(out).toContain('Foo')
})
