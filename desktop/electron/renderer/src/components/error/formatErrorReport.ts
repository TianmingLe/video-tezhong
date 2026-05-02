export function formatErrorReport(input: {
  appVersion?: string | null
  platform?: string | null
  href?: string | null
  error: unknown
  componentStack?: string | null
  maxStackChars?: number
}): string {
  const appVersion = (input.appVersion ?? '').trim() || 'unknown'
  const platform = (input.platform ?? '').trim() || 'unknown'
  const href = (input.href ?? '').trim() || 'unknown'

  const max =
    typeof input.maxStackChars === 'number' && Number.isFinite(input.maxStackChars)
      ? Math.max(200, Math.floor(input.maxStackChars))
      : 4000

  const asError = input.error instanceof Error ? input.error : null
  const errorMessage = (() => {
    if (typeof input.error === 'string') return input.error
    if (asError) return asError.message
    if (!input.error) return 'unknown'
    try {
      return JSON.stringify(input.error)
    } catch {
      return String(input.error)
    }
  })()

  const rawStack = asError?.stack ? String(asError.stack) : ''
  const stack = rawStack.length > max ? rawStack.slice(0, max) + '\n…(truncated)' : rawStack

  const componentStack = (input.componentStack ?? '').trim()

  const lines: string[] = []
  lines.push(`appVersion: ${appVersion}`)
  lines.push(`platform: ${platform}`)
  lines.push(`href: ${href}`)
  lines.push(`errorMessage: ${errorMessage}`)
  if (stack) lines.push(`stack:\n${stack}`)
  if (componentStack) lines.push(`componentStack:\n${componentStack}`)
  return lines.join('\n')
}
