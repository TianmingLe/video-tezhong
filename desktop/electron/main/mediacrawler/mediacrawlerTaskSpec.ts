export type MediaCrawlerTaskKind = 'dy_mvp' | 'xhs_search' | 'bili_search'

export type MediaCrawlerTaskSpec = {
  kind: MediaCrawlerTaskKind
  runId: string
  pythonIndexUrl?: string
  args: Record<string, string | number | boolean | string[]>
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}

function isSafeToken(s: string): boolean {
  if (!s) return false
  if (s.length > 2000) return false
  if (s.includes('\n') || s.includes('\r') || s.includes('\0')) return false
  return true
}

function isSafeRunId(runId: string): boolean {
  const s = String(runId || '').trim()
  if (!s) return false
  if (s.length > 120) return false
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(s)
}

const kindAllowlist: Record<MediaCrawlerTaskKind, Set<string>> = {
  dy_mvp: new Set(['platform', 'lt', 'pipeline', 'specified_id', 'enable_llm', 'output_format', 'dry_run']),
  xhs_search: new Set(['platform', 'lt', 'type', 'keywords', 'limit', 'output_format', 'dry_run']),
  bili_search: new Set(['platform', 'lt', 'type', 'keywords', 'limit', 'output_format', 'dry_run'])
}

function validateArgs(kind: MediaCrawlerTaskKind, args: Record<string, unknown>): { ok: true; value: MediaCrawlerTaskSpec['args'] } | { ok: false; error: string } {
  const allow = kindAllowlist[kind]
  const out: MediaCrawlerTaskSpec['args'] = {}

  for (const [k, v] of Object.entries(args)) {
    if (!allow.has(k)) return { ok: false, error: `unsupported arg: ${k}` }
    if (typeof v === 'string') {
      const s = v.trim()
      if (!isSafeToken(s)) return { ok: false, error: `invalid string arg: ${k}` }
      out[k] = s
      continue
    }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return { ok: false, error: `invalid number arg: ${k}` }
      out[k] = v
      continue
    }
    if (typeof v === 'boolean') {
      out[k] = v
      continue
    }
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' && isSafeToken(String(x).trim()))) {
      out[k] = v.map((x) => String(x).trim())
      continue
    }
    return { ok: false, error: `invalid arg type: ${k}` }
  }

  if (kind === 'dy_mvp') {
    if (out.platform !== 'dy') return { ok: false, error: 'dy_mvp requires platform=dy' }
    if (out.pipeline !== 'mvp') return { ok: false, error: 'dy_mvp requires pipeline=mvp' }
    if (!out.specified_id || typeof out.specified_id !== 'string') return { ok: false, error: 'dy_mvp requires specified_id' }
  }
  if (kind === 'xhs_search') {
    if (out.platform !== 'xhs') return { ok: false, error: 'xhs_search requires platform=xhs' }
    if (out.type !== 'search') return { ok: false, error: 'xhs_search requires type=search' }
    if (!out.keywords || typeof out.keywords !== 'string') return { ok: false, error: 'xhs_search requires keywords' }
    if (typeof out.limit !== 'number' || out.limit < 1 || out.limit > 50) return { ok: false, error: 'xhs_search requires limit 1-50' }
  }
  if (kind === 'bili_search') {
    if (out.platform !== 'bili') return { ok: false, error: 'bili_search requires platform=bili' }
    if (out.type !== 'search') return { ok: false, error: 'bili_search requires type=search' }
    if (!out.keywords || typeof out.keywords !== 'string') return { ok: false, error: 'bili_search requires keywords' }
    if (typeof out.limit !== 'number' || out.limit < 1 || out.limit > 50) return { ok: false, error: 'bili_search requires limit 1-50' }
  }

  return { ok: true, value: out }
}

export function validateMediaCrawlerTaskSpec(input: unknown): { ok: true; value: MediaCrawlerTaskSpec } | { ok: false; error: string } {
  if (!isRecord(input)) return { ok: false, error: 'invalid payload' }
  const kind = input.kind
  if (kind !== 'dy_mvp' && kind !== 'xhs_search' && kind !== 'bili_search') return { ok: false, error: 'invalid kind' }

  const runId = String(input.runId || '').trim()
  if (!isSafeRunId(runId)) return { ok: false, error: 'invalid runId' }

  const pythonIndexUrl = input.pythonIndexUrl ? String(input.pythonIndexUrl).trim() : undefined
  if (pythonIndexUrl && !isSafeToken(pythonIndexUrl)) return { ok: false, error: 'invalid pythonIndexUrl' }

  if (!isRecord(input.args)) return { ok: false, error: 'invalid args' }
  const args = validateArgs(kind, input.args)
  if (!args.ok) return { ok: false, error: args.error }

  return { ok: true, value: { kind, runId, pythonIndexUrl, args: args.value } }
}

