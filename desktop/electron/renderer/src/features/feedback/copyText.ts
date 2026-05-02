export type CopyTextDeps = {
  writeText?: (text: string) => Promise<void>
  execCommandCopy?: (text: string) => boolean
}

export async function copyText(text: string, deps: CopyTextDeps = {}): Promise<{ success: true } | { success: false; error: string }> {
  const writeText =
    deps.writeText ??
    (typeof navigator !== 'undefined' ? navigator.clipboard?.writeText?.bind(navigator.clipboard) : undefined)
  const execCommandCopy = deps.execCommandCopy ?? defaultExecCommandCopy

  const fallback = (primaryError: unknown): { success: true } | { success: false; error: string } => {
    if (!execCommandCopy) return { success: false, error: normalizeError(primaryError) }
    try {
      const ok = execCommandCopy(text)
      if (ok) return { success: true }
      const suffix = normalizeError(primaryError)
      return { success: false, error: suffix ? `execCommandCopy failed; ${suffix}` : 'execCommandCopy failed' }
    } catch (err) {
      const suffix = normalizeError(primaryError)
      const extra = normalizeError(err)
      return { success: false, error: [extra, suffix].filter(Boolean).join('; ') }
    }
  }

  if (writeText) {
    try {
      await writeText(text)
      return { success: true }
    } catch (err) {
      return fallback(err)
    }
  }

  if (!execCommandCopy) return { success: false, error: 'no clipboard strategy available' }
  try {
    const ok = execCommandCopy(text)
    return ok ? { success: true } : { success: false, error: 'execCommandCopy failed' }
  } catch (err) {
    return { success: false, error: normalizeError(err) }
  }
}

function defaultExecCommandCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const body = document.body
  if (!body) return false

  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', 'true')
  el.style.position = 'fixed'
  el.style.top = '0'
  el.style.left = '0'
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
  el.style.width = '1px'
  el.style.height = '1px'
  body.appendChild(el)
  el.focus()
  el.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  body.removeChild(el)
  return ok
}

function normalizeError(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return String(err.message || err.name || 'unknown')
  const msg = String(err || '').trim()
  return msg ? msg : 'unknown'
}
