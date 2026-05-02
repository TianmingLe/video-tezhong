import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'
import { RetryButton, createRetryController } from './RetryButton'

describe('RetryButton', () => {
  test('renders label', () => {
    const html = renderToStaticMarkup(React.createElement(RetryButton, { label: '重试', onRetry: async () => {} }))
    expect(html).toContain('重试')
  })

  test('controller transitions idle -> loading -> idle on success', async () => {
    const onSnapshot = vi.fn()
    const onRetry = vi.fn(async () => {})
    const ctrl = createRetryController({ onRetry, onSnapshot })

    const p = ctrl.retry()
    expect(ctrl.getSnapshot().status).toBe('loading')
    await p

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(ctrl.getSnapshot().status).toBe('idle')
    expect(onSnapshot).toHaveBeenCalled()
  })

  test('controller sets error on failure', async () => {
    const onSnapshot = vi.fn()
    const ctrl = createRetryController({
      onRetry: async () => {
        throw new Error('boom')
      },
      onSnapshot
    })

    await ctrl.retry()
    expect(ctrl.getSnapshot().status).toBe('error')
    expect(ctrl.getSnapshot().error).toContain('boom')
  })
})

