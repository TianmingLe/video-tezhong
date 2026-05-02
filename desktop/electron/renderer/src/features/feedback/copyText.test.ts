import { describe, expect, test, vi } from 'vitest'
import { copyText } from './copyText'

describe('copyText', () => {
  test('优先使用 writeText', async () => {
    const writeText = vi.fn(async () => {})
    const execCommandCopy = vi.fn(() => false)
    const res = await copyText('x', { writeText, execCommandCopy })
    expect(res.success).toBe(true)
    expect(writeText).toHaveBeenCalledWith('x')
    expect(execCommandCopy).not.toHaveBeenCalled()
  })

  test('writeText 失败时回退到 execCommandCopy', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied')
    })
    const execCommandCopy = vi.fn(() => true)
    const res = await copyText('x', { writeText, execCommandCopy })
    expect(res.success).toBe(true)
    expect(execCommandCopy).toHaveBeenCalledWith('x')
  })

  test('两种策略都失败时返回 error', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied')
    })
    const execCommandCopy = vi.fn(() => false)
    const res = await copyText('x', { writeText, execCommandCopy })
    expect(res.success).toBe(false)
  })

  test('没有 writeText 时直接使用 execCommandCopy', async () => {
    const execCommandCopy = vi.fn(() => true)
    const res = await copyText('x', { execCommandCopy })
    expect(res.success).toBe(true)
    expect(execCommandCopy).toHaveBeenCalledWith('x')
  })
})
