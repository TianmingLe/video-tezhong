import { describe, expect, test, vi } from 'vitest'
import { StartupMetrics } from './startupMetrics'

describe('StartupMetrics', () => {
  test('constructor stores t0 at init and computes deltas from t0', () => {
    const now = vi.fn()
    now.mockReturnValueOnce(1000)
    now.mockReturnValueOnce(1120)
    now.mockReturnValueOnce(1300)

    const m = new StartupMetrics({ now })
    m.mark('whenReady')
    m.mark('createWindow')

    const snap = m.getSnapshot()
    expect(snap.t0).toBe(1000)
    expect(snap.marks.whenReady).toBe(1120)
    expect(snap.marks.createWindow).toBe(1300)
    expect(snap.deltas.whenReady).toBe(120)
    expect(snap.deltas.createWindow).toBe(300)
  })

  test('mark is idempotent for the same key', () => {
    const now = vi.fn()
    now.mockReturnValueOnce(10)
    now.mockReturnValueOnce(20)
    now.mockReturnValueOnce(30)

    const m = new StartupMetrics({ now })
    m.mark('whenReady')
    m.mark('whenReady')

    const snap = m.getSnapshot()
    expect(snap.marks.whenReady).toBe(20)
    expect(snap.deltas.whenReady).toBe(10)
  })
})

