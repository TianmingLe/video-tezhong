import { expect, test, vi } from 'vitest'
import { attachAppNavigate } from './useAppNavigate'

test('attachAppNavigate wires app:navigate to router navigate', () => {
  const nav = vi.fn()
  let captured: unknown = null
  const onNavigate = (cb: (ev: { path: string }) => void): (() => void) => {
    captured = cb
    return () => {}
  }

  const off = attachAppNavigate(onNavigate, nav)
  expect(typeof off).toBe('function')

  if (typeof captured !== 'function') throw new Error('handler not registered')
  ;(captured as (ev: { path: string }) => void)({ path: '/report/test-123' })
  expect(nav).toHaveBeenCalledWith('/report/test-123')
})
