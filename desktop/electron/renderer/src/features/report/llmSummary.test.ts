import { describe, expect, test } from 'vitest'
import { summarizeAnalyses } from './llmSummary'

describe('llmSummary', () => {
  test('summarizeAnalyses aggregates cost/tokens/tags/insights', () => {
    const a: any = {
      status: 'success',
      usage: { total_tokens: 100, cost_usd: 0.01 },
      comment_value_judge: { items: [{ tags: ['t1', 't2'] }, { tags: ['t1'] }] },
      community_insights: { consensus: ['c1'], controversy: ['v1'] },
      knowledge_points: [{ title: 'k1' }, { title: 'k2' }]
    }
    const b: any = { status: 'error' }
    const out = summarizeAnalyses([a, b])
    expect(out.success).toBe(1)
    expect(out.error).toBe(1)
    expect(out.totalTokens).toBe(100)
    expect(out.totalCostUsd).toBeCloseTo(0.01)
    expect(out.topTags[0]).toEqual({ tag: 't1', count: 2 })
    expect(out.consensus).toEqual(['c1'])
    expect(out.controversy).toEqual(['v1'])
    expect(out.topKnowledgeTitles).toEqual(['k1', 'k2'])
  })
})

