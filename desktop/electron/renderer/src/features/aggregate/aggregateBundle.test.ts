import { describe, expect, test } from 'vitest'
import { buildAggregateBundle } from './aggregateBundle'

describe('aggregateBundle', () => {
  test('buildAggregateBundle aggregates tags/insights/ocr and renders md', () => {
    const bundle = buildAggregateBundle({
      runs: [
        {
          runId: 'r1',
          analyses: [
            {
              fileName: 'mvp_analysis_000_a.json',
              data: {
                status: 'success',
                video_url: 'u1',
                source_keyword: 'k1',
                comment_value_judge: { items: [{ tags: ['t1', 't2'] }, { tags: ['t1'] }] },
                community_insights: { consensus: ['c1'], controversy: ['v1'] },
                ocr_summary: { key_texts: ['o1', 'o2'] },
                knowledge_points: [{ title: 'kp1', content: 'c' }]
              }
            }
          ]
        },
        {
          runId: 'r2',
          analyses: [
            {
              fileName: 'mvp_analysis_000_b.json',
              data: {
                status: 'success',
                video_url: 'u2',
                source_keyword: 'k2',
                comment_value_judge: { items: [{ tags: ['t2'] }] },
                community_insights: { consensus: ['c1', 'c2'], controversy: [] },
                ocr_summary: { key_texts: ['o2', 'o3'] },
                knowledge_points: [{ title: 'kp1' }, { title: 'kp2' }]
              }
            }
          ]
        }
      ]
    })

    expect(bundle.files['kb_tags.json']).toContain('"t1": 2')
    expect(bundle.files['kb_tags.json']).toContain('"t2": 2')
    expect(bundle.files['kb_insights.json']).toContain('"consensus"')
    expect(bundle.files['kb_insights.json']).toContain('c2')
    expect(bundle.files['kb_insights.json']).toContain('o3')
    expect(bundle.files['kb_summary.md']).toContain('## 聚合知识点（去重）')
    expect(bundle.files['kb_summary.md']).toContain('## 社区反馈（跨视频）')
  })
})

