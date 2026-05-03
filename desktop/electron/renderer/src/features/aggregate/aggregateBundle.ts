type AnalysisRecord = Record<string, unknown>

type AnalysisInput = {
  fileName: string
  data: AnalysisRecord
}

export type AggregateRunInput = {
  runId: string
  analyses: AnalysisInput[]
}

export type AggregateBundle = {
  dirNameHint: string
  files: Record<string, string>
}

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
}

function ensureObject(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function awemeIdFromFileName(name: string): string {
  const m = String(name || '').match(/^mvp_analysis_\d{3}_(.+)\.json$/)
  return m?.[1] ?? ''
}

function uniqPush(out: string[], s: string, cap: number) {
  if (!s || out.length >= cap) return
  if (out.includes(s)) return
  out.push(s)
}

export function parseAnalysis(text: string): AnalysisRecord | null {
  try {
    const obj = JSON.parse(String(text || '')) as unknown
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
    return obj as AnalysisRecord
  } catch {
    return null
  }
}

export function buildAggregateBundle(args: { runs: AggregateRunInput[] }): AggregateBundle {
  const runs = Array.isArray(args.runs) ? args.runs : []
  const ts = Date.now()
  const dirNameHint = `${ts}_${runs.length}`

  const indexRows: any[] = []
  const tagCounts = new Map<string, number>()
  const consensus: string[] = []
  const controversy: string[] = []
  const ocrTexts: string[] = []
  const knowledgeTitles: string[] = []
  const knowledgeUniq = new Map<string, { title: string; content: string; timestamp: string }>()
  let okCount = 0
  let errCount = 0

  for (const run of runs) {
    const runId = safeString(run.runId).trim()
    const analyses = Array.isArray(run.analyses) ? run.analyses : []
    for (const it of analyses) {
      const fileName = safeString(it.fileName)
      const data = ensureObject(it.data) ?? {}
      const status = safeString((data as any).status)
      if (status === 'success') okCount += 1
      else errCount += 1

      const cv = ensureObject((data as any).comment_value_judge)
      const items = cv && Array.isArray((cv as any).items) ? ((cv as any).items as unknown[]) : []
      const tags: string[] = []
      for (const row of items) {
        const o = ensureObject(row)
        if (!o) continue
        const ts = safeStringArray((o as any).tags)
        for (const t of ts) {
          tags.push(t)
          tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
        }
      }

      const ci = ensureObject((data as any).community_insights)
      if (ci) {
        for (const x of safeStringArray((ci as any).consensus)) uniqPush(consensus, x, 50)
        for (const x of safeStringArray((ci as any).controversy)) uniqPush(controversy, x, 50)
      }

      const ocr = ensureObject((data as any).ocr_summary)
      if (ocr) {
        for (const x of safeStringArray((ocr as any).key_texts)) uniqPush(ocrTexts, x, 100)
      }

      const kps = Array.isArray((data as any).knowledge_points) ? ((data as any).knowledge_points as unknown[]) : []
      for (const kp of kps) {
        const o = ensureObject(kp)
        if (!o) continue
        const title = safeString((o as any).title).trim()
        const content = safeString((o as any).content).trim()
        const timestamp = safeString((o as any).timestamp).trim()
        const key = (title || content).trim()
        if (!key) continue
        if (!knowledgeUniq.has(key)) knowledgeUniq.set(key, { title, content, timestamp })
        if (title) uniqPush(knowledgeTitles, title, 100)
      }

      indexRows.push({
        run_id: runId,
        aweme_id: awemeIdFromFileName(fileName),
        video_url: safeString((data as any).video_url),
        source_keyword: safeString((data as any).source_keyword),
        tags,
        knowledge_points: (data as any).knowledge_points ?? [],
        community_insights: (data as any).community_insights ?? {},
        ocr_summary: (data as any).ocr_summary ?? {},
        analysis_file: fileName
      })
    }
  }

  const tagsObj: Record<string, number> = {}
  for (const [k, v] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) tagsObj[k] = v

  const insights = {
    runs: runs.map((r) => r.runId),
    stats: { success: okCount, error: errCount },
    community: { consensus, controversy },
    ocr: { key_texts: ocrTexts },
    knowledge_titles: knowledgeTitles
  }

  const indexJsonl = indexRows.map((r) => JSON.stringify(r, null, 0)).join('\n') + (indexRows.length ? '\n' : '')
  const tagsJson = JSON.stringify(tagsObj, null, 2)
  const insightsJson = JSON.stringify(insights, null, 2)
  const metaJson = JSON.stringify({ createdAt: ts, runs: runs.map((r) => r.runId) }, null, 2)

  const mdLines: string[] = []
  mdLines.push('# 知识库总结（规则聚合）')
  mdLines.push('')
  mdLines.push('## 视频索引')
  if (indexRows.length) {
    for (const row of indexRows.slice(0, 200)) {
      mdLines.push(`- ${(row.run_id as string) || ''}: ${(row.video_url as string) || ''}`.trim())
    }
  } else {
    mdLines.push('- （无）')
  }
  mdLines.push('')
  mdLines.push('## 聚合知识点（去重）')
  if (knowledgeUniq.size) {
    for (const v of [...knowledgeUniq.values()].slice(0, 50)) {
      const prefix = v.timestamp ? `${v.timestamp} ` : ''
      const titleOrContent = (v.title || v.content).trim()
      mdLines.push(`- ${prefix}${titleOrContent}`.trim())
      if (v.content && v.content !== titleOrContent) mdLines.push(`  - ${v.content}`)
    }
  } else {
    mdLines.push('- （无）')
  }
  mdLines.push('')
  mdLines.push('## 标签统计')
  const topTags = Object.entries(tagsObj)
    .filter(([, v]) => v >= 1)
    .slice(0, 20)
  if (topTags.length) {
    for (const [k, v] of topTags) mdLines.push(`- ${k}: ${v}`)
  } else {
    mdLines.push('- （无）')
  }
  mdLines.push('')
  mdLines.push('## 社区反馈（跨视频）')
  mdLines.push('')
  mdLines.push('### 共识')
  if (consensus.length) for (const x of consensus.slice(0, 20)) mdLines.push(`- ${x}`)
  else mdLines.push('- （无）')
  mdLines.push('')
  mdLines.push('### 争议')
  if (controversy.length) for (const x of controversy.slice(0, 20)) mdLines.push(`- ${x}`)
  else mdLines.push('- （无）')
  mdLines.push('')
  mdLines.push('## 画面文字（跨视频）')
  if (ocrTexts.length) for (const x of ocrTexts.slice(0, 30)) mdLines.push(`- ${x}`)
  else mdLines.push('- （无）')
  mdLines.push('')

  const mdText = mdLines.join('\n')

  return {
    dirNameHint,
    files: {
      'kb_summary.md': mdText,
      'kb_index.jsonl': indexJsonl,
      'kb_tags.json': tagsJson,
      'kb_insights.json': insightsJson,
      'meta.json': metaJson
    }
  }
}

