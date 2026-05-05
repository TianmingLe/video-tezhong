export type ErrorCategory = 'NETWORK' | 'PYTHON' | 'FILE_SYSTEM' | 'PERMISSION' | 'VALIDATION' | 'UNKNOWN'

export type ClassifiedError = {
  category: ErrorCategory
  code: string
  userMessage: string
  devDetail: string
  suggestion: string
}

const categoryMeta: Record<
  ErrorCategory,
  { userMessage: string; suggestion: string }
> = {
  NETWORK: {
    userMessage: '网络连接异常，请检查网络状态后重试。',
    suggestion: '请检查网络连接、代理设置或防火墙规则，然后重试。'
  },
  PYTHON: {
    userMessage: 'Python 环境异常，请检查 Python 安装。',
    suggestion: '请确认已安装 Python 3 并加入 PATH，或尝试重新安装依赖。'
  },
  FILE_SYSTEM: {
    userMessage: '文件系统错误，操作无法完成。',
    suggestion: '请检查文件是否被占用、路径是否正确，或磁盘空间是否充足。'
  },
  PERMISSION: {
    userMessage: '权限不足，无法执行该操作。',
    suggestion: '请以管理员身份运行应用，或检查文件/目录权限设置。'
  },
  VALIDATION: {
    userMessage: '输入数据校验失败，请检查填写内容。',
    suggestion: '请根据提示修正输入内容后重试。'
  },
  UNKNOWN: {
    userMessage: '发生未知错误，请稍后重试或联系支持。',
    suggestion: '如果问题持续出现，请复制错误信息并反馈给我们。'
  }
}

function inferCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as any).code
    if (typeof code === 'string' && code) return code
  }
  return 'UNKNOWN'
}

function toMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const msg = (error as any).message
    if (typeof msg === 'string') return msg
  }
  return String(error)
}

function matchCategory(error: unknown): { category: ErrorCategory; code: string } {
  const msg = toMessage(error).toLowerCase()
  const code = inferCode(error)

  const isPythonRelated = msg.includes('python') || msg.includes('spawn') || msg.includes('pip') || msg.includes('venv')
  if (isPythonRelated) {
    if (code === 'ENOENT' || msg.includes('enoent') || msg.includes('not found') || msg.includes('is not recognized')) {
      return { category: 'PYTHON', code: 'PYTHON_NOT_FOUND' }
    }
    return { category: 'PYTHON', code: 'PYTHON_ERROR' }
  }

  if (code === 'ENOENT' || code === 'EBUSY' || code === 'EEXIST' || code === 'ENOTEMPTY') {
    return { category: 'FILE_SYSTEM', code }
  }
  if (code === 'EPERM' || code === 'EACCES') {
    return { category: 'PERMISSION', code }
  }
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND') {
    return { category: 'NETWORK', code }
  }
  if (code === 'SQLITE_BUSY') {
    return { category: 'PERMISSION', code }
  }

  if (msg.includes('zod') || msg.includes('validation') || msg.includes('invalid') || msg.includes('required')) {
    return { category: 'VALIDATION', code: 'VALIDATION_ERROR' }
  }

  if (msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('network') || msg.includes('enetunreach')) {
    return { category: 'NETWORK', code: 'NETWORK_ERROR' }
  }

  if (msg.includes('eperm') || msg.includes('eacces') || msg.includes('permission denied') || msg.includes('access denied')) {
    return { category: 'PERMISSION', code: 'PERMISSION_DENIED' }
  }

  if (msg.includes('ebusy') || msg.includes('enoent') || msg.includes('not a file') || msg.includes('invalid path')) {
    return { category: 'FILE_SYSTEM', code: 'FILE_SYSTEM_ERROR' }
  }

  return { category: 'UNKNOWN', code: code || 'UNKNOWN' }
}

export function classifyError(error: unknown): ClassifiedError {
  const { category, code } = matchCategory(error)
  const meta = categoryMeta[category]
  const devDetail = toMessage(error)

  return {
    category,
    code,
    userMessage: meta.userMessage,
    devDetail,
    suggestion: meta.suggestion
  }
}

export function classifyErrorWithContext(error: unknown, context?: { runId?: string; operation?: string }): ClassifiedError {
  const base = classifyError(error)
  const ctxParts: string[] = []
  if (context?.operation) ctxParts.push(`operation=${context.operation}`)
  if (context?.runId) ctxParts.push(`runId=${context.runId}`)
  if (ctxParts.length > 0) {
    return {
      ...base,
      devDetail: `[${ctxParts.join(', ')}] ${base.devDetail}`
    }
  }
  return base
}
