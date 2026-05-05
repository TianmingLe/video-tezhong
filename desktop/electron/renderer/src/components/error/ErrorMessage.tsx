import React, { useState } from 'react'
import type { ErrorCategory } from '../../../../main/error/ErrorClassifier'

type ErrorMessageProps = {
  category: ErrorCategory
  code: string
  userMessage: string
  suggestion: string
  devDetail?: string | null
}

const categoryStyles: Record<
  ErrorCategory,
  { border: string; background: string; icon: string }
> = {
  NETWORK: {
    border: 'rgba(131,170,255,0.35)',
    background: 'rgba(131,170,255,0.10)',
    icon: '🌐'
  },
  PYTHON: {
    border: 'rgba(255,180,100,0.35)',
    background: 'rgba(255,180,100,0.10)',
    icon: '🐍'
  },
  FILE_SYSTEM: {
    border: 'rgba(255,220,100,0.35)',
    background: 'rgba(255,220,100,0.10)',
    icon: '📁'
  },
  PERMISSION: {
    border: 'rgba(255,120,120,0.35)',
    background: 'rgba(255,120,120,0.10)',
    icon: '🔒'
  },
  VALIDATION: {
    border: 'rgba(160,255,160,0.35)',
    background: 'rgba(160,255,160,0.10)',
    icon: '✏️'
  },
  UNKNOWN: {
    border: 'rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    icon: '❓'
  }
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  category,
  code,
  userMessage,
  suggestion,
  devDetail
}) => {
  const [expanded, setExpanded] = useState(false)
  const style = categoryStyles[category]

  const cardStyle: React.CSSProperties = {
    border: `1px solid ${style.border}`,
    background: style.background,
    borderRadius: 12,
    padding: 14,
    boxSizing: 'border-box'
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10
  }

  const iconStyle: React.CSSProperties = {
    fontSize: 20,
    lineHeight: 1
  }

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 15,
    fontWeight: 600
  }

  const codeStyle: React.CSSProperties = {
    fontSize: 11,
    opacity: 0.7,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  }

  const bodyStyle: React.CSSProperties = {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 1.6,
    opacity: 0.9
  }

  const suggestionStyle: React.CSSProperties = {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.8
  }

  const detailBoxStyle: React.CSSProperties = {
    marginTop: 10,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(0,0,0,0.25)',
    borderRadius: 10,
    padding: 10,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span style={iconStyle} aria-hidden="true">{style.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleStyle}>{userMessage}</div>
          <div style={codeStyle}>{category} · {code}</div>
        </div>
      </div>
      <div style={bodyStyle}>{suggestion}</div>
      {devDetail ? (
        <details style={{ marginTop: 10 }}>
          <summary
            style={{ cursor: 'pointer', fontSize: 12, opacity: 0.85, userSelect: 'none' }}
            onClick={() => setExpanded((v) => !v)}
          >
            技术详情
          </summary>
          <div style={detailBoxStyle}>{devDetail}</div>
        </details>
      ) : null}
    </div>
  )
}
