import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseAnalysisJson, summarizeAnalyses, type LlmSummary } from './llmSummary'

type Props = {
  runId: string
}

export function RunLlmSummaryPanel(props: Props) {
  const rid = props.runId
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<LlmSummary | null>(null)
  const [files, setFiles] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!rid) return
    setLoading(true)
    setError(null)
    try {
      const listRes = await window.api.job.listRunArtifacts(rid)
      if (!listRes.success) throw new Error(listRes.error)
      const picked = listRes.files
        .map((x) => x.name)
        .filter((n) => n.startsWith('mvp_analysis_') && n.endsWith('.json'))
        .sort()
        .slice(0, 20)
      setFiles(picked)

      const analyses: Array<Record<string, unknown>> = []
      for (const name of picked) {
        const r = await window.api.job.readRunFile(rid, name, 512 * 1024)
        if (!r.success) continue
        const parsed = parseAnalysisJson(r.text)
        if (parsed) analyses.push(parsed)
      }
      setSummary(summarizeAnalyses(analyses))
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setSummary(null)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [rid])

  useEffect(() => {
    void load()
  }, [load])

  const empty = useMemo(() => files.length === 0 && !loading && !error, [error, files.length, loading])

  return (
    <div className="card">
      <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600 }}>LLM 分析</div>
        <button type="button" className="btn" onClick={load} disabled={!rid || loading}>
          刷新
        </button>
        {files.length ? <div className="muted">已识别 {files.length} 份 mvp_analysis</div> : null}
      </div>

      {error ? <div className="error">{error}</div> : null}
      {empty ? <div className="row muted">未找到 mvp_analysis_*.json</div> : null}

      {summary ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="muted">成功：{summary.success}</div>
            <div className="muted">失败：{summary.error}</div>
            <div className="muted">Tokens：{summary.totalTokens}</div>
            <div className="muted">成本(USD)：{summary.totalCostUsd}</div>
          </div>

          {summary.topTags.length ? (
            <div className="row">
              <div className="label">Top Tags</div>
              <div className="muted">{summary.topTags.map((t) => `${t.tag}(${t.count})`).join(' · ')}</div>
            </div>
          ) : null}

          {summary.consensus.length ? (
            <div className="row">
              <div className="label">共识</div>
              <div className="muted">{summary.consensus.join(' · ')}</div>
            </div>
          ) : null}

          {summary.controversy.length ? (
            <div className="row">
              <div className="label">争议</div>
              <div className="muted">{summary.controversy.join(' · ')}</div>
            </div>
          ) : null}

          {summary.topKnowledgeTitles.length ? (
            <div className="row">
              <div className="label">知识点</div>
              <div className="muted">{summary.topKnowledgeTitles.join(' · ')}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

