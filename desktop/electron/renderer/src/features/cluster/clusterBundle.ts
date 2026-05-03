import type { ClusterGroup, ClusterIndexRow, ClusterResult, VideoBucketRow } from './clusterTypes'

export function buildClusterFiles(args: {
  createdAt: number
  runs: string[]
  question: string
  keywords: string[]
  instruction: string
  useLlm: boolean
  maxKnowledgePoints: number
  minClusterSize: number
  rows: ClusterIndexRow[]
  clusters: ClusterGroup[]
  misc: string[]
}): { files: Record<string, string> } {
  const buckets: ClusterResult['buckets'] = { '0': [], '1': [], '2': [], '3': [] }
  for (const r of args.rows) buckets[String(r.bucket) as '0' | '1' | '2' | '3'].push(r.id)

  const videoMap = new Map<string, VideoBucketRow>()
  for (const r of args.rows) {
    const key = `${r.run_id}::${r.aweme_id || r.video_url}`
    const cur =
      videoMap.get(key) ??
      ({
        run_id: r.run_id,
        aweme_id: r.aweme_id,
        video_url: r.video_url,
        bucket: 0,
        bucket_label: '没用',
        counts: { b0: 0, b1: 0, b2: 0, b3: 0 }
      } as VideoBucketRow)
    if (r.bucket === 0) cur.counts.b0 += 1
    if (r.bucket === 1) cur.counts.b1 += 1
    if (r.bucket === 2) cur.counts.b2 += 1
    if (r.bucket === 3) cur.counts.b3 += 1
    if (r.bucket > cur.bucket) {
      cur.bucket = r.bucket
      cur.bucket_label = r.bucket === 3 ? '强相关' : r.bucket === 2 ? '中等相关' : r.bucket === 1 ? '较弱相关' : '没用'
    }
    videoMap.set(key, cur)
  }
  const videos = [...videoMap.values()]

  const res: ClusterResult = {
    stats: {
      success_items: args.rows.length,
      error_items: 0,
      total_points: args.rows.length,
      used_points: args.rows.length,
      truncated: false,
      use_llm: args.useLlm,
      min_cluster_size: args.minClusterSize,
      max_knowledge_points: args.maxKnowledgePoints
    },
    buckets,
    videos,
    clusters: args.clusters,
    misc: args.misc
  }

  const meta = {
    createdAt: args.createdAt,
    runs: args.runs,
    question: args.question,
    keywords: args.keywords,
    instruction: args.instruction,
    useLlm: args.useLlm,
    maxKnowledgePoints: args.maxKnowledgePoints,
    minClusterSize: args.minClusterSize,
    version: 1
  }

  const indexJsonl = args.rows.map((r) => JSON.stringify(r, null, 0)).join('\n') + (args.rows.length ? '\n' : '')

  const md: string[] = []
  md.push('# 聚类/筛选结果（知识点）')
  md.push('')
  md.push('## 输入')
  md.push(`- 问题：${args.question}`)
  md.push(`- 关键词：${args.keywords.join(', ')}`)
  if (args.instruction) md.push(`- 指令：${args.instruction}`)
  md.push(`- runs：${args.runs.join(', ')}`)
  md.push('')
  md.push('## 概览')
  md.push(`- 知识点条目：${args.rows.length}`)
  md.push(`- 强相关：${buckets['3'].length} · 中等：${buckets['2'].length} · 较弱：${buckets['1'].length} · 没用：${buckets['0'].length}`)
  md.push('')
  md.push('## 主题簇（bucket>=1）')
  if (args.clusters.length) {
    for (const c of args.clusters) md.push(`- ${c.name} (${c.item_ids.length})`)
  } else {
    md.push('- （无）')
  }
  md.push('')

  return {
    files: {
      'cluster_summary.md': md.join('\n'),
      'cluster_result.json': JSON.stringify(res, null, 2),
      'cluster_index.jsonl': indexJsonl,
      'meta.json': JSON.stringify(meta, null, 2)
    }
  }
}

