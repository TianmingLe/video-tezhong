import { describe, expect, test } from 'vitest'
import { scoreBucket } from './clusterRuleScore'

describe('clusterRuleScore', () => {
  test('scoreBucket maps hits to 0..3', () => {
    expect(scoreBucket({ text: '完全无关', tags: [], keywords: ['提问'] })).toBe(0)
    expect(scoreBucket({ text: '包含提问', tags: [], keywords: ['提问'] })).toBeGreaterThan(0)
    expect(scoreBucket({ text: '提问 关键词 都出现', tags: ['提问'], keywords: ['提问', '关键词'] })).toBe(3)
  })
})
