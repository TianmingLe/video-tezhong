type Analysis = Record<string, unknown>

export function parseAnalysisJson(text: string): Analysis | null {
  try {
    const obj = JSON.parse(String(text || '')) as unknown
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    return obj as Analysis
  } catch {
    return null
  }
}

export type LlmSummary = {
  success: number
  error: number
  totalTokens: number
  totalCostUsd: number
  topTags: Array<{ tag: string; count: number }>
  consensus: string[]
  controversy: string[]
  topKnowledgeTitles: string[]
}

function pushUniq(out: string[], s: unknown, cap: number) {
  if (out.length >= cap) return
  if (typeof s !== 'string') return
  const t = s.trim()
  if (!t) return
  if (out.includes(t)) return
  out.push(t)
}

export function summarizeAnalyses(list: Analysis[]): LlmSummary {
  let success = 0
  let error = 0
  let totalTokens = 0
  let totalCostUsd = 0

  const tagCounts = new Map<string, number>()
  const consensus: string[] = []
  const controversy: string[] = []
  const knowledgeTitles: string[] = []

  for (const a of list) {
    const status = typeof a.status === 'string' ? a.status : ''
    if (status === 'success') success += 1
    else error += 1

    const usage = a.usage && typeof a.usage === 'object' && !Array.isArray(a.usage) ? (a.usage as Record<string, unknown>) : null
    const tokens = usage && typeof usage.total_tokens === 'number' ? usage.total_tokens : 0
    const cost = usage && typeof usage.cost_usd === 'number' ? usage.cost_usd : 0
    if (Number.isFinite(tokens)) totalTokens += tokens
    if (Number.isFinite(cost)) totalCostUsd += cost

    const cv = a.comment_value_judge && typeof a.comment_value_judge === 'object' && !Array.isArray(a.comment_value_judge)
      ? (a.comment_value_judge as Record<string, unknown>)
      : null
    const items = cv && Array.isArray(cv.items) ? (cv.items as unknown[]) : []
    for (const it of items) {
      if (!it || typeof it !== 'object' || Array.isArray(it)) continue
      const tags = (it as any).tags
      if (!Array.isArray(tags)) continue
      for (const t of tags) {
        if (typeof t !== 'string') continue
        const k = t.trim()
        if (!k) continue
        tagCounts.set(k, (tagCounts.get(k) ?? 0) + 1)
      }
    }

    const ci = a.community_insights && typeof a.community_insights === 'object' && !Array.isArray(a.community_insights)
      ? (a.community_insights as Record<string, unknown>)
      : null
    if (ci) {
      const cs = Array.isArray(ci.consensus) ? ci.consensus : []
      const vs = Array.isArray(ci.controversy) ? ci.controversy : []
      for (const x of cs) pushUniq(consensus, x, 40)
      for (const x of vs) pushUniq(controversy, x, 40)
    }

    const kps = Array.isArray((a as any).knowledge_points) ? ((a as any).knowledge_points as unknown[]) : []
    for (const kp of kps) {
      if (!kp || typeof kp !== 'object' || Array.isArray(kp)) continue
      pushUniq(knowledgeTitles, (kp as any).title, 60)
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))

  return {
    success,
    error,
    totalTokens,
    totalCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
    topTags,
    consensus: consensus.slice(0, 10),
    controversy: controversy.slice(0, 10),
    topKnowledgeTitles: knowledgeTitles.slice(0, 10)
  }
}

