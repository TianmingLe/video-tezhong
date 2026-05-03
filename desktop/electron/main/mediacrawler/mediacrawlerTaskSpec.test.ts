import { describe, expect, test } from 'vitest'
import { validateMediaCrawlerTaskSpec } from './mediacrawlerTaskSpec'

describe('validateMediaCrawlerTaskSpec', () => {
  test('accepts dy_mvp', () => {
    const res = validateMediaCrawlerTaskSpec({
      kind: 'dy_mvp',
      runId: 'r1',
      args: { specifiedId: 'https://www.douyin.com/video/123' }
    })
    expect(res.ok).toBe(true)
  })

  test('rejects unknown kind', () => {
    const res = validateMediaCrawlerTaskSpec({ kind: 'unknown', runId: 'r1', args: {} })
    expect(res.ok).toBe(false)
  })

  test('rejects bad runId', () => {
    const res = validateMediaCrawlerTaskSpec({ kind: 'dy_mvp', runId: '../x', args: { specifiedId: '1' } })
    expect(res.ok).toBe(false)
  })

  test('rejects unknown args key', () => {
    const res = validateMediaCrawlerTaskSpec({ kind: 'xhs_search', runId: 'r1', args: { bad: 1 } })
    expect(res.ok).toBe(false)
  })
})

