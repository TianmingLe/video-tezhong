import { describe, expect, test, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ToastHost } from './ToastHost'
import { toastStore } from './toastStore'

describe('ToastHost', () => {
  beforeEach(() => {
    toastStore.clear()
  })

  test('SSR renders toast title and message', () => {
    toastStore.show({ title: 'T', message: 'M' })
    const html = renderToString(<ToastHost />)
    expect(html).toContain('T')
    expect(html).toContain('M')
  })

  test('SSR renders action buttons', () => {
    toastStore.show({ message: 'M', actions: [{ label: 'A', onClick: () => {} }] })
    const html = renderToString(<ToastHost />)
    expect(html).toContain('A')
  })

  test('dismiss removes toast', () => {
    const id = toastStore.show({ message: 'M' })
    toastStore.dismiss(id)
    const html = renderToString(<ToastHost />)
    expect(html).toBe('')
  })
})

