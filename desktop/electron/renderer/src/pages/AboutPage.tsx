import { useEffect, useState } from 'react'
import type { AppVersionInfo } from '../../../preload/types'

export function AboutPage() {
  const [info, setInfo] = useState<AppVersionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.app
      .getVersion()
      .then((res) => {
        if (cancelled) return
        setInfo(res)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String((e as Error)?.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <h1 className="page-title">关于</h1>

      <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>OmniScraper Desktop</div>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
          <div className="muted">加载失败：{error}</div>
        </div>
      ) : info ? (
        <>
          <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <div className="muted">版本</div>
              <div>{info.version}</div>
              <div className="muted">Commit</div>
              <div style={{ fontFamily: 'monospace' }}>{info.commitHash}</div>
              <div className="muted">构建通道</div>
              <div>
                {info.isNightly ? (
                  <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Nightly</span>
                ) : (
                  <span>Release</span>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
            <div className="row">
              <div className="label">运行环境</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 8 }}>
              <div className="muted">Electron</div>
              <div>{info.electronVersion}</div>
              <div className="muted">Chrome</div>
              <div>{info.chromeVersion}</div>
              <div className="muted">Node.js</div>
              <div>{info.nodeVersion}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
          <div className="muted">加载中…</div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
        <div className="muted" style={{ textAlign: 'center' }}>
          © {new Date().getFullYear()} OmniScraper
        </div>
      </div>
    </div>
  )
}
