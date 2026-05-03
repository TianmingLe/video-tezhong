export type MediaCrawlerTaskKind = 'dy_mvp' | 'xhs_search' | 'bili_search'

export type MediaCrawlerTaskSpec = {
  kind: MediaCrawlerTaskKind
  runId: string
  pythonIndexUrl?: string
  args: Record<string, unknown>
}

const runIdRe = /^[a-zA-Z0-9._-]+$/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function ensureString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

function ensureInt(v: unknown): number | null {
  if (typeof v !== 'number') return null
  if (!Number.isFinite(v)) return null
  const n = Math.floor(v)
  return n === v ? n : null
}

function validateArgs(kind: MediaCrawlerTaskKind, args: Record<string, unknown>): string | null {
  const allowed = new Set<string>()
  if (kind === 'dy_mvp') {
    allowed.add('specifiedId')
    allowed.add('enableLlm')
    const specifiedId = ensureString(args.specifiedId)
    if (!specifiedId) return 'specifiedId is required'
  } else if (kind === 'xhs_search' || kind === 'bili_search') {
    allowed.add('keywords')
    allowed.add('limit')
    allowed.add('enableLlm')
    const keywords = ensureString(args.keywords)
    if (!keywords) return 'keywords is required'
    const limitRaw = args.limit
    if (limitRaw !== undefined) {
      const limit = ensureInt(limitRaw)
      if (limit === null) return 'limit must be int'
      if (limit < 1 || limit > 50) return 'limit out of range'
    }
  } else {
    return 'unknown kind'
  }

  for (const k of Object.keys(args)) {
    if (!allowed.has(k)) return `unknown args key: ${k}`
  }

  return null
}

export function validateMediaCrawlerTaskSpec(
  input: unknown
): { ok: true; value: MediaCrawlerTaskSpec } | { ok: false; error: string } {
  if (!isPlainObject(input)) return { ok: false, error: 'input must be object' }
  const kind = ensureString(input.kind)
  if (kind !== 'dy_mvp' && kind !== 'xhs_search' && kind !== 'bili_search') return { ok: false, error: 'invalid kind' }

  const runId = ensureString(input.runId)
  if (!runId) return { ok: false, error: 'runId is required' }
  if (runId.length > 128) return { ok: false, error: 'runId too long' }
  if (!runIdRe.test(runId)) return { ok: false, error: 'invalid runId' }

  const args = input.args
  if (!isPlainObject(args)) return { ok: false, error: 'args must be object' }

  const argErr = validateArgs(kind, args)
  if (argErr) return { ok: false, error: argErr }

  const pythonIndexUrl = ensureString(input.pythonIndexUrl)

  return {
    ok: true,
    value: { kind, runId, args: { ...args }, pythonIndexUrl: pythonIndexUrl ?? undefined }
  }
}

