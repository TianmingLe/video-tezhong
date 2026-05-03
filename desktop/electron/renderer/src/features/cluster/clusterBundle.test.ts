import { describe, expect, test } from 'vitest'
import { buildClusterFiles } from './clusterBundle'

describe('clusterBundle', () => {
  test('buildClusterFiles outputs expected files and video bucket max', () => {
    const out = buildClusterFiles({
      createdAt: 1700000000000,
      runs: ['r1', 'r2'],
      question: 'q',
      keywords: ['k'],
      instruction: '',
      useLlm: false,
      maxKnowledgePoints: 500,
      minClusterSize: 3,
      rows: [
        {
          id: 'a',
          run_id: 'r1',
          aweme_id: 'x',
          video_url: 'u1',
          source_keyword: 's1',
          tags: [],
          knowledge_point: { title: 't', content: '', timestamp: '' },
          bucket: 3,
          bucket_label: '强相关',
          reason: 'r',
          cluster_id: null
        },
        {
          id: 'b',
          run_id: 'r1',
          aweme_id: 'x',
          video_url: 'u1',
          source_keyword: 's1',
          tags: [],
          knowledge_point: { title: 't2', content: '', timestamp: '' },
          bucket: 1,
          bucket_label: '较弱相关',
          reason: 'r',
          cluster_id: null
        }
      ],
      clusters: [],
      misc: []
    })

    expect(out.files['cluster_summary.md']).toContain('# 聚类/筛选结果（知识点）')
    expect(out.files['cluster_result.json']).toContain('"videos"')
    expect(out.files['cluster_index.jsonl']).toContain('"id":"a"')
    expect(out.files['meta.json']).toContain('"question": "q"')
    const res = JSON.parse(out.files['cluster_result.json'])
    expect(res.videos[0].bucket).toBe(3)
  })
})
