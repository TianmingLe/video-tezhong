import { describe, expect, test } from 'vitest'
import { validateMediaCrawlerTaskSpec } from './mediacrawlerTaskSpec'

describe('validateMediaCrawlerTaskSpec', () => {
  test('accepts dy_mvp', () => {
    const r = validateMediaCrawlerTaskSpec({
      kind: 'dy_mvp',
      runId: 'r1',
      args: { platform: 'dy', lt: 'qrcode', pipeline: 'mvp', specified_id: '123', output_format: 'all', dry_run: false }
    })
    expect(r.ok).toBe(true)
  })

  test('accepts xhs_search', () => {
    const r = validateMediaCrawlerTaskSpec({
      kind: 'xhs_search',
      runId: 'r1',
      args: { platform: 'xhs', lt: 'qrcode', type: 'search', keywords: 'k', limit: 3, output_format: 'all', dry_run: false }
    })
    expect(r.ok).toBe(true)
  })

  test('rejects unsupported arg key', () => {
    const r = validateMediaCrawlerTaskSpec({
      kind: 'bili_search',
      runId: 'r1',
      args: { platform: 'bili', lt: 'qrcode', type: 'search', keywords: 'k', limit: 3, hack: '1' }
    })
    expect(r.ok).toBe(false)
  })
})

