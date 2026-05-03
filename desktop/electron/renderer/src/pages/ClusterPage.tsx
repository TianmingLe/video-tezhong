import { useEffect, useMemo, useState } from 'react'
import type { TaskRecord } from '../../../preload/types'
import { toastStore } from '../components/toast/toastStore'
import { scoreBucket } from '../features/cluster/clusterRuleScore'
import { buildClusterFiles } from '../features/cluster/clusterBundle'
import type { ClusterGroup, ClusterIndexRow, ClusterResult } from '../features/cluster/clusterTypes'
import { ClusterResultPanel } from '../features/cluster/ClusterResultPanel'

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(String(text || '')) as unknown
    if (!isObject(obj)) return null
    return obj
  } catch {
    return null
  }
}

function extractJsonSlice(text: string): string {
  const s = String(text || '')
  const i = s.indexOf('{')
  const j = s.lastIndexOf('}')
  if (i !== -1 && j !== -1 && j > i) return s.slice(i, j + 1)
  const a = s.indexOf('[')
  const b = s.lastIndexOf(']')
  if (a !== -1 && b !== -1 && b > a) return s.slice(a, b + 1)
  return s
}

function normalizeKeywords(question: string, keywordText: string): string[] {
  const raw = `${question || ''} ${keywordText || ''}`
  const parts = raw
    .split(/[,，\s]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
  const set = new Set(parts)
  return Array.from(set).slice(0, 30)
}

function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i += 1) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(16)
}

function bucketLabel(b: 0 | 1 | 2 | 3): string {
  if (b === 3) return '强相关'
  if (b === 2) return '中等相关'
  if (b === 1) return '较弱相关'
  return '没用'
}

export function ClusterPage() {
  const [runs, setRuns] = useState<TaskRecord[]>([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([])

  const [question, setQuestion] = useState('')
  const [keywordsText, setKeywordsText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [useLlm, setUseLlm] = useState(true)
  const [maxKnowledgePoints, setMaxKnowledgePoints] = useState(500)
  const [minClusterSize, setMinClusterSize] = useState(3)

  const [running, setRunning] = useState(false)
  const [dirName, setDirName] = useState<string | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [result, setResult] = useState<ClusterResult | null>(null)
  const [rows, setRows] = useState<ClusterIndexRow[]>([])
  const [clusters, setClusters] = useState<ClusterGroup[]>([])

  useEffect(() => {
    let cancelled = false
    setLoadingRuns(true)
    window.api.job
      .history()
      .then((list) => {
        if (cancelled) return
        setRuns(list)
      })
      .finally(() => {
        if (cancelled) return
        setLoadingRuns(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedSet = useMemo(() => new Set(selectedRunIds), [selectedRunIds])

  const toggleSelected = (runId: string) => {
    setSelectedRunIds((prev) => {
      const set = new Set(prev)
      if (set.has(runId)) set.delete(runId)
      else set.add(runId)
      return Array.from(set)
    })
  }

  const resetResult = () => {
    setDirName(null)
    setFiles([])
    setResult(null)
    setRows([])
    setClusters([])
  }

  const run = async () => {
    if (running) return
    const q = question.trim()
    if (!q) {
      toastStore.show({ title: '聚类', message: '请填写问题' })
      return
    }
    if (selectedRunIds.length === 0) {
      toastStore.show({ title: '聚类', message: '请至少选择 1 个 run' })
      return
    }

    const keywords = normalizeKeywords(q, keywordsText)
    const maxKP = Number.isFinite(maxKnowledgePoints) ? Math.max(50, Math.min(2000, Math.floor(maxKnowledgePoints))) : 500
    const minSize = Number.isFinite(minClusterSize) ? Math.max(2, Math.min(50, Math.floor(minClusterSize))) : 3

    setRunning(true)
    resetResult()

    try {
      const llmCfg = await window.api.llm.getConfig().catch(() => null)
      const llmOk = Boolean(useLlm && llmCfg && llmCfg.hasKey && llmCfg.apiBaseUrl && llmCfg.model)
      if (useLlm && !llmOk) toastStore.show({ title: '聚类', message: 'LLM 未配置或不可用，将使用降级规则（不做主题聚类）' })

      type Item = {
        id: string
        run_id: string
        aweme_id: string
        video_url: string
        source_keyword: string
        tags: string[]
        title: string
        content: string
        timestamp: string
      }

      const items: Item[] = []

      for (const runId of selectedRunIds) {
        const listRes = await window.api.job.listRunArtifacts(runId)
        if (!listRes.success) continue
        const names = listRes.files
          .map((x) => x.name)
          .filter((n) => n.startsWith('mvp_analysis_') && n.endsWith('.json'))
          .sort()
          .slice(0, 80)
        for (const name of names) {
          const r = await window.api.job.readRunFile(runId, name, 512 * 1024)
          if (!r.success) continue
          const obj = parseJsonObject(r.text)
          if (!obj) continue
          const aweme_id = safeString((obj as any).aweme_id) || safeString((obj as any).awemeId)
          const video_url = safeString((obj as any).video_url) || safeString((obj as any).videoUrl)
          const source_keyword = safeString((obj as any).source_keyword) || safeString((obj as any).sourceKeyword)

          const tagsSet = new Set<string>()
          const cv = isObject((obj as any).comment_value_judge) ? ((obj as any).comment_value_judge as Record<string, unknown>) : null
          const cvItems = cv && Array.isArray((cv as any).items) ? ((cv as any).items as unknown[]) : []
          for (const it of cvItems) {
            const o = isObject(it) ? (it as any) : null
            for (const t of safeStringArray(o?.tags)) tagsSet.add(t)
          }
          const tags = Array.from(tagsSet)

          const kps = Array.isArray((obj as any).knowledge_points) ? ((obj as any).knowledge_points as unknown[]) : []
          for (const kp of kps) {
            const kpo = isObject(kp) ? (kp as any) : null
            if (!kpo) continue
            const title = safeString(kpo.title).trim()
            const content = safeString(kpo.content).trim()
            const timestamp = safeString(kpo.timestamp).trim()
            const text = (title || content).trim()
            if (!text) continue
            const id = `${runId}:${aweme_id}:${hashString(`${title}\n${content}\n${timestamp}`)}`
            items.push({ id, run_id: runId, aweme_id, video_url, source_keyword, tags, title, content, timestamp })
          }
        }
      }

      const totalPoints = items.length
      const usedItems = items.slice(0, maxKP)
      const truncated = totalPoints > usedItems.length

      type Scored = { id: string; bucket: 0 | 1 | 2 | 3; reason: string }
      const scored = new Map<string, Scored>()

      const scoreFallback = (it: Item): Scored => {
        const text = `${it.title}\n${it.content}`.trim()
        const b = scoreBucket({ text, tags: it.tags, keywords })
        const reason = b === 0 ? '关键词未命中' : `命中关键词：${keywords.filter((k) => text.includes(k) || it.tags.includes(k)).slice(0, 8).join(', ')}`
        return { id: it.id, bucket: b, reason }
      }

      if (llmOk) {
        const batchSize = 30
        for (let i = 0; i < usedItems.length; i += batchSize) {
          const batch = usedItems.slice(i, i + batchSize)
          const payload = {
            question: q,
            keywords,
            instruction: instruction.trim(),
            items: batch.map((x) => ({
              id: x.id,
              text: `${x.title}\n${x.content}`.trim().slice(0, 600),
              tags: x.tags.slice(0, 20)
            }))
          }
          const system =
            'You are a strict classifier. Return ONLY valid JSON array. Each item: {id:string, bucket:0|1|2|3, reason:string}. bucket meanings: 0 useless, 1 weakly relevant, 2 moderately relevant, 3 strongly relevant.'
          const res = await window.api.llmChat({
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: JSON.stringify(payload) }
            ],
            temperature: 0
          })
          if (!res.success) {
            for (const it of batch) scored.set(it.id, scoreFallback(it))
            continue
          }
          try {
            const slice = extractJsonSlice(res.content)
            const arr = JSON.parse(slice) as unknown
            if (!Array.isArray(arr)) throw new Error('invalid')
            const got = new Map<string, Scored>()
            for (const row of arr) {
              if (!isObject(row)) continue
              const id = safeString((row as any).id)
              const b = Number((row as any).bucket)
              const reason = safeString((row as any).reason).slice(0, 200)
              if (!id) continue
              if (b !== 0 && b !== 1 && b !== 2 && b !== 3) continue
              got.set(id, { id, bucket: b as 0 | 1 | 2 | 3, reason: reason || '' })
            }
            for (const it of batch) scored.set(it.id, got.get(it.id) ?? scoreFallback(it))
          } catch {
            for (const it of batch) scored.set(it.id, scoreFallback(it))
          }
        }
      } else {
        for (const it of usedItems) scored.set(it.id, scoreFallback(it))
      }

      const useful = usedItems
        .map((x) => ({ x, s: scored.get(x.id)! }))
        .filter((t) => t.s.bucket >= 1)
        .sort((a, b) => b.s.bucket - a.s.bucket)
      const clusterCandidates = useful.slice(0, 200)

      let clustersOut: ClusterGroup[] = []
      let misc: string[] = useful.slice(200).map((x) => x.x.id)
      if (llmOk && clusterCandidates.length) {
        const payload = {
          question: q,
          keywords,
          instruction: instruction.trim(),
          minClusterSize: minSize,
          items: clusterCandidates.map((t) => ({
            id: t.x.id,
            bucket: t.s.bucket,
            text: `${t.x.title}\n${t.x.content}`.trim().slice(0, 600),
            tags: t.x.tags.slice(0, 20)
          }))
        }
        const system =
          'Group items into thematic clusters. Return ONLY valid JSON object {clusters: Array<{cluster_id,name,description,item_ids,importance_rank}>, misc: string[]}. cluster_id must be unique short strings. Each cluster must have at least minClusterSize items.'
        const res = await window.api.llmChat({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(payload) }
          ],
          temperature: 0
        })
        if (res.success) {
          try {
            const slice = extractJsonSlice(res.content)
            const obj = JSON.parse(slice) as any
            const cls = Array.isArray(obj?.clusters) ? obj.clusters : []
            const miscIds = Array.isArray(obj?.misc) ? obj.misc : []
            clustersOut = (cls as any[])
              .map(
                (c: any): ClusterGroup => ({
                  cluster_id: safeString(c.cluster_id) || safeString(c.id) || `c_${hashString(JSON.stringify(c)).slice(0, 6)}`,
                  name: safeString(c.name).trim() || '未命名',
                  description: safeString(c.description).trim(),
                  item_ids: Array.isArray(c.item_ids) ? c.item_ids.map((x: any) => safeString(x)).filter(Boolean) : [],
                  importance_rank: Number.isFinite(Number(c.importance_rank)) ? Number(c.importance_rank) : 0
                })
              )
              .filter((c: ClusterGroup) => c.item_ids.length >= minSize)
            misc = [...misc, ...miscIds.map((x: any) => safeString(x)).filter(Boolean)]
          } catch {
            clustersOut = []
          }
        }
      }

      const idToCluster = new Map<string, string>()
      for (const c of clustersOut) for (const id of c.item_ids) idToCluster.set(id, c.cluster_id)

      const indexRows: ClusterIndexRow[] = usedItems.map((it) => {
        const s = scored.get(it.id)!
        const cluster_id = s.bucket >= 1 ? idToCluster.get(it.id) ?? null : null
        return {
          id: it.id,
          run_id: it.run_id,
          aweme_id: it.aweme_id,
          video_url: it.video_url,
          source_keyword: it.source_keyword,
          tags: it.tags,
          knowledge_point: { title: it.title, content: it.content, timestamp: it.timestamp },
          bucket: s.bucket,
          bucket_label: bucketLabel(s.bucket),
          reason: s.reason,
          cluster_id
        }
      })

      const createdAt = Date.now()
      const bundle = buildClusterFiles({
        createdAt,
        runs: selectedRunIds,
        question: q,
        keywords,
        instruction: instruction.trim(),
        useLlm: llmOk,
        maxKnowledgePoints: maxKP,
        minClusterSize: minSize,
        totalPoints,
        usedPoints: usedItems.length,
        truncated,
        errorItems: 0,
        rows: indexRows,
        clusters: clustersOut,
        misc
      })

      const saved = await window.api.cluster.save({ runs: selectedRunIds, files: bundle.files })
      setDirName(saved.dirName)
      setFiles(saved.files)
      setRows(indexRows)
      setClusters(clustersOut)
      setResult(JSON.parse(bundle.files['cluster_result.json']) as ClusterResult)
    } catch (e) {
      toastStore.show({ title: '聚类', message: `运行失败：${String((e as Error)?.message || e)}` })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">聚类</h1>
      <p className="page-subtitle">按“问题/关键词”对知识点做 4 档相关性筛选，并在可用时用 LLM 做主题聚类。</p>

      <div className="grid" style={{ alignItems: 'start' }}>
        <div>
          <div className="card">
            <div className="row">
              <div className="label">问题</div>
              <textarea className="input" value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} />
            </div>
            <div className="row">
              <div className="label">关键词</div>
              <input className="input" value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} placeholder="逗号分隔，可空" />
            </div>
            <div className="row">
              <div className="label">指令</div>
              <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="可选：本次运行生效，不保存" />
            </div>
            <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                优先使用 LLM
              </label>
              <div className="muted" style={{ marginLeft: 'auto' }}>
                处理上限
              </div>
              <input
                className="input"
                style={{ width: 120 }}
                value={String(maxKnowledgePoints)}
                onChange={(e) => setMaxKnowledgePoints(Number(e.target.value))}
              />
              <div className="muted">最小簇</div>
              <input className="input" style={{ width: 90 }} value={String(minClusterSize)} onChange={(e) => setMinClusterSize(Number(e.target.value))} />
            </div>
            <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={run} disabled={running}>
                运行
              </button>
              <button type="button" className="btn" onClick={resetResult} disabled={running}>
                清空结果
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="label" style={{ marginBottom: 0 }}>
                Runs
              </div>
              {loadingRuns ? <div className="muted">加载中…</div> : <div className="muted">{selectedRunIds.length} 已选择</div>}
            </div>
            <div style={{ display: 'grid', gap: 6, marginTop: 10, maxHeight: 420, overflow: 'auto' }}>
              {runs.map((r) => (
                <label key={r.run_id} className="muted" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={selectedSet.has(r.run_id)} onChange={() => toggleSelected(r.run_id)} />
                  <span>
                    {r.run_id} · {r.status} · {r.script}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div>
          {dirName && result ? (
            <ClusterResultPanel
              dirName={dirName}
              files={files}
              result={result}
              rows={rows}
              clusters={clusters}
              onUpdateFiles={setFiles}
              onDeletedDir={() => {
                resetResult()
              }}
            />
          ) : (
            <div className="card">
              <div className="row muted">右侧将展示运行结果（4 档 + 主题簇 + 产物预览/导出/删除）。</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
