type CopyToClipboardArgs = {
  text: string
  clipboardWriteText?: (text: string) => Promise<void>
  execCommandCopy?: (text: string) => boolean
}

export async function copyToClipboard(
  args: CopyToClipboardArgs
): Promise<{ success: true } | { success: false; error: string }> {
  const { text, clipboardWriteText, execCommandCopy } = args

  const fallback = (primaryError: unknown): { success: true } | { success: false; error: string } => {
    if (!execCommandCopy) return { success: false, error: normalizeError(primaryError) }
    const ok = execCommandCopy(text)
    if (ok) return { success: true }
    const suffix = normalizeError(primaryError)
    return { success: false, error: suffix ? `execCommandCopy failed; ${suffix}` : 'execCommandCopy failed' }
  }

  if (clipboardWriteText) {
    try {
      await clipboardWriteText(text)
      return { success: true }
    } catch (err) {
      return fallback(err)
    }
  }

  if (execCommandCopy) {
    try {
      const ok = execCommandCopy(text)
      return ok ? { success: true } : { success: false, error: 'execCommandCopy failed' }
    } catch (err) {
      return { success: false, error: normalizeError(err) }
    }
  }

  return { success: false, error: 'no clipboard strategy available' }
}

function normalizeError(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return String(err.message || err.name || 'unknown')
  const msg = String(err || '').trim()
  return msg ? msg : 'unknown'
}

