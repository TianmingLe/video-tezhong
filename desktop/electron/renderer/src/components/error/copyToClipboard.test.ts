import { describe, expect, test, vi } from 'vitest'
import { copyToClipboard } from './copyToClipboard'

describe('copyToClipboard', () => {
  test('uses clipboardWriteText when available', async () => {
    const clipboardWriteText = vi.fn(async () => {})
    const res = await copyToClipboard({ text: 'x', clipboardWriteText, execCommandCopy: () => false })
    expect(res.success).toBe(true)
    expect(clipboardWriteText).toHaveBeenCalledWith('x')
  })

  test('falls back to execCommandCopy when clipboard throws', async () => {
    const clipboardWriteText = vi.fn(async () => {
      throw new Error('denied')
    })
    const execCommandCopy = vi.fn(() => true)
    const res = await copyToClipboard({ text: 'x', clipboardWriteText, execCommandCopy })
    expect(res.success).toBe(true)
    expect(execCommandCopy).toHaveBeenCalled()
  })

  test('returns error when all strategies fail', async () => {
    const clipboardWriteText = vi.fn(async () => {
      throw new Error('denied')
    })
    const execCommandCopy = vi.fn(() => false)
    const res = await copyToClipboard({ text: 'x', clipboardWriteText, execCommandCopy })
    expect(res.success).toBe(false)
  })
})

