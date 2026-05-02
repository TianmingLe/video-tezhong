import React from 'react'
import { copyToClipboard } from './copyToClipboard'
import { formatErrorReport } from './formatErrorReport'

type ErrorBoundaryProps = {
  children: React.ReactNode
}

type ErrorBoundaryState = {
  error: unknown | null
  componentStack: string
  copyStatus: 'idle' | 'success' | 'error'
  copyError: string | null
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message || 'unknown'
  if (!error) return 'unknown'
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function execCommandCopy(text: string): boolean {
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
  document.body.appendChild(el)
  el.focus()
  el.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(el)
  return ok
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: '', copyStatus: 'idle', copyError: null }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(_error: unknown, info: React.ErrorInfo): void {
    this.setState({ componentStack: info.componentStack || '' })
  }

  private buildReport(): string {
    const appVersion = String(window.api?.version ?? '').trim() || 'unknown'
    const platform = String(navigator?.userAgent ?? '').trim() || 'unknown'
    const href = String(window.location?.href ?? '').trim() || 'unknown'
    return formatErrorReport({
      appVersion,
      platform,
      href,
      error: this.state.error,
      componentStack: this.state.componentStack
    })
  }

  private onCopy = async () => {
    const text = this.buildReport()
    const clipboardWriteText = navigator.clipboard?.writeText?.bind(navigator.clipboard)
    const res = await copyToClipboard({ text, clipboardWriteText, execCommandCopy })
    if (res.success) {
      this.setState({ copyStatus: 'success', copyError: null })
    } else {
      this.setState({ copyStatus: 'error', copyError: res.error })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = getErrorMessage(this.state.error)
    const errorStack = this.state.error instanceof Error ? String(this.state.error.stack || '') : ''
    const combinedStack = [errorStack.trim(), this.state.componentStack.trim()].filter(Boolean).join('\n\n')

    const rootStyle: React.CSSProperties = {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
      boxSizing: 'border-box',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
    }

    const cardStyle: React.CSSProperties = {
      width: '100%',
      maxWidth: 920,
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 14,
      padding: 18,
      boxSizing: 'border-box'
    }

    const titleStyle: React.CSSProperties = { margin: 0, fontSize: 20, letterSpacing: 0.2 }

    const subtitleStyle: React.CSSProperties = { marginTop: 8, opacity: 0.8, lineHeight: 1.5, fontSize: 13 }

    const codeStyle: React.CSSProperties = {
      marginTop: 12,
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(0,0,0,0.25)',
      borderRadius: 12,
      padding: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }

    const toolbarStyle: React.CSSProperties = { marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }

    const buttonBase: React.CSSProperties = {
      appearance: 'none',
      border: '1px solid rgba(255,255,255,0.14)',
      background: 'rgba(255,255,255,0.04)',
      color: 'inherit',
      borderRadius: 12,
      padding: '8px 12px',
      cursor: 'pointer',
      fontSize: 13
    }

    const buttonPrimary: React.CSSProperties = {
      ...buttonBase,
      borderColor: 'rgba(131,170,255,0.35)',
      background: 'rgba(131,170,255,0.14)'
    }

    const hintStyle: React.CSSProperties = { marginTop: 10, fontSize: 12, opacity: 0.8 }

    const copyHint =
      this.state.copyStatus === 'success'
        ? '已复制到剪贴板'
        : this.state.copyStatus === 'error'
          ? `复制失败：${this.state.copyError || 'unknown'}`
          : null

    return (
      <div style={rootStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>页面发生错误</h1>
          <div style={subtitleStyle}>可以尝试复制错误信息并反馈，或返回任务页继续使用。</div>

          <div style={codeStyle}>{message}</div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', opacity: 0.9, fontSize: 13 }}>查看堆栈</summary>
            <pre style={{ ...codeStyle, marginTop: 10 }}>{combinedStack || '无堆栈信息'}</pre>
          </details>

          <div style={toolbarStyle}>
            <button type="button" style={buttonPrimary} onClick={this.onCopy}>
              复制错误信息
            </button>
            <button type="button" style={buttonBase} onClick={() => window.location.assign('/tasks')}>
              返回任务页
            </button>
            <button type="button" style={buttonBase} onClick={() => window.location.reload()}>
              重新加载
            </button>
          </div>

          {copyHint ? <div style={hintStyle}>{copyHint}</div> : null}
        </div>
      </div>
    )
  }
}

