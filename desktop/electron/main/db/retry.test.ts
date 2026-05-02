import { describe, expect, test, vi } from 'vitest'
import { createRetryRunner } from './index'

function busyError(): Error & { code: string } {
  const e = new Error('database is locked') as Error & { code: string }
  e.code = 'SQLITE_BUSY'
  return e
}

describe('createRetryRunner', () => {
  test('no retry when success at first attempt', () => {
    const sleep = vi.fn()
    const runWithRetry = createRetryRunner({ sleep })

    const res = runWithRetry(() => 123)

    expect(res).toBe(123)
    expect(sleep).not.toHaveBeenCalled()
  })

  test('retries with exponential backoff 50/100/200', () => {
    const sleep = vi.fn()
    const runWithRetry = createRetryRunner({ sleep })

    let calls = 0
    const res = runWithRetry(() => {
      calls++
      if (calls <= 3) throw busyError()
      return 'ok'
    })

    expect(res).toBe('ok')
    expect(calls).toBe(4)
    expect(sleep.mock.calls.map((x) => x[0])).toEqual([50, 100, 200])
  })

  test('throws after exceeding retries', () => {
    const sleep = vi.fn()
    const runWithRetry = createRetryRunner({ sleep })

    expect(() =>
      runWithRetry(() => {
        throw busyError()
      })
    ).toThrow()

    expect(sleep.mock.calls.map((x) => x[0])).toEqual([50, 100, 200])
  })
})

