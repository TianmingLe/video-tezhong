import { expect, test, vi } from 'vitest'
import { runNotifyFlow } from './notifyFlow'

test('runNotifyFlow: click navigates to report and focuses window', () => {
  const showAndFocusWindow = vi.fn()
  const sendNavigate = vi.fn()
  let onClick: unknown = null
  const createNotification = vi.fn(() => ({
    onClick: (cb: () => void) => {
      onClick = cb
    },
    show: vi.fn()
  }))

  runNotifyFlow({
    runId: 'test-123',
    exitCode: 0,
    platform: 'win32',
    deps: { createNotification, showAndFocusWindow, sendNavigate }
  })

  expect(createNotification).toHaveBeenCalledOnce()
  if (typeof onClick !== 'function') throw new Error('missing onClick')
  ;(onClick as () => void)()
  expect(showAndFocusWindow).toHaveBeenCalledOnce()
  expect(sendNavigate).toHaveBeenCalledWith('/report/test-123')
})
