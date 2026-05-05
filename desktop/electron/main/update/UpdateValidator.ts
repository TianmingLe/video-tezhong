export type UpdateValidationResult = {
  ok: boolean
  errors: string[]
  warnings: string[]
  feedURL: string | null
  channel: string | null
}

export type UpdateValidatorDeps = {
  buildChannel: string | undefined
  updateServerUrl: string | undefined
  feedURL: string | undefined
}

export function validateUpdateConfig(deps: UpdateValidatorDeps): UpdateValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const channel = deps.buildChannel ?? 'stable'
  const updateServerUrl = deps.updateServerUrl ?? ''
  const feedURL = deps.feedURL ?? ''

  if (!updateServerUrl) {
    errors.push('更新服务器 URL 未配置')
  }

  if (channel !== 'nightly' && channel !== 'stable') {
    warnings.push(`未知的构建通道: ${channel}`)
  }

  const expectedFeedPrefix = channel === 'nightly' ? `${updateServerUrl}/nightly` : `${updateServerUrl}/stable`

  if (feedURL && !feedURL.startsWith(expectedFeedPrefix)) {
    warnings.push(`feedURL 与通道不匹配: 期望以 ${expectedFeedPrefix} 开头，实际为 ${feedURL}`)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    feedURL: feedURL || null,
    channel
  }
}
