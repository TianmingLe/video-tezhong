import { useEffect, useState } from 'react'
import type { ConfigRecord, TrayConfig, TrayLeftClickMode } from '../../../preload/types'
import { RetryButton } from '../components/RetryButton'
import { useDbState } from '../contexts/DbStateContext'

export function SettingsPage() {
  const { isReadOnly } = useDbState()
  const [trayConfig, setTrayConfig] = useState<TrayConfig | null>(null)
  const [kbConfigs, setKbConfigs] = useState<ConfigRecord[]>([])
  const [kbLoading, setKbLoading] = useState(true)
  const [kbError, setKbError] = useState<{ message: string; retry: () => Promise<void> } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.tray.getConfig().then((cfg) => {
      if (cancelled) return
      setTrayConfig(cfg)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setKbLoading(true)
    window.api.kb
      .list()
      .then((list) => {
        if (cancelled) return
        setKbConfigs(list)
        setKbError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setKbError({ message: String((e as Error)?.message || e), retry: refreshKb })
      })
      .finally(() => {
        if (cancelled) return
        setKbLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateLeftClick = async (mode: TrayLeftClickMode) => {
    const next = await window.api.tray.updateConfig({ leftClick: mode })
    setTrayConfig(next)
  }

  const refreshKb = async () => {
    setKbLoading(true)
    try {
      const list = await window.api.kb.list()
      setKbConfigs(list)
      setKbError(null)
    } catch (e) {
      setKbError({ message: String((e as Error)?.message || e), retry: refreshKb })
    } finally {
      setKbLoading(false)
    }
  }

  const setDefault = async (id: number) => {
    try {
      await window.api.kb.setDefault(id)
      await refreshKb()
      setKbError(null)
    } catch (e) {
      setKbError({ message: String((e as Error)?.message || e), retry: async () => await setDefault(id) })
    }
  }

  const duplicateAsTemplate = async (cfg: ConfigRecord) => {
    const name = window.prompt('模板名称', cfg.name)
    const trimmed = String(name || '').trim()
    if (!trimmed) return
    try {
      await window.api.kb.save({
        name: trimmed,
        script: cfg.script,
        scenario: cfg.scenario,
        gateway_ws: cfg.gateway_ws,
        env: cfg.env,
        is_default: 0
      })
      await refreshKb()
      setKbError(null)
    } catch (e) {
      setKbError({ message: String((e as Error)?.message || e), retry: async () => await duplicateAsTemplate(cfg) })
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">设置</h1>
      <p className="page-subtitle">托盘行为配置（即时生效）。</p>

      <div className="card" style={{ marginTop: 16, maxWidth: 520 }}>
        <div className="row">
          <div className="label">左键点击</div>
          <select
            className="input"
            value={trayConfig?.leftClick ?? ''}
            disabled={!trayConfig}
            onChange={(e) => updateLeftClick(e.target.value as TrayLeftClickMode)}
          >
            <option value="" disabled>
              加载中...
            </option>
            <option value="menu">弹出菜单</option>
            <option value="toggle">显示/隐藏窗口</option>
            <option value="none">无操作</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="label" style={{ marginBottom: 0 }}>
            模板配置
          </div>
          <button type="button" className="btn" onClick={refreshKb}>
            刷新
          </button>
        </div>

        {kbError ? (
          <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="muted">操作失败：{kbError.message}</div>
            <RetryButton label="重试" onRetry={kbError.retry} />
          </div>
        ) : null}

        {kbLoading ? (
          <div className="muted" style={{ marginTop: 10 }}>
            加载中...
          </div>
        ) : kbConfigs.length === 0 ? (
          <div className="muted" style={{ marginTop: 10 }}>
            暂无模板
          </div>
        ) : (
          <div className="list">
            {kbConfigs.map((cfg) => (
              <div key={cfg.id} className="list-item" style={{ cursor: 'default' }}>
                <div className="list-title">
                  {cfg.name} {cfg.is_default === 1 ? <span className="muted">（默认）</span> : null}
                </div>
                <div className="list-subtitle">
                  {cfg.script} · {cfg.scenario} {cfg.gateway_ws ? `· ${cfg.gateway_ws}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={isReadOnly || cfg.is_default === 1}
                    title={isReadOnly ? '数据库只读模式，无法修改默认模板' : cfg.is_default === 1 ? '已是默认' : undefined}
                    onClick={() => setDefault(cfg.id)}
                  >
                    设为默认
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={isReadOnly}
                    title={isReadOnly ? '数据库只读模式，无法写入模板' : undefined}
                    onClick={() => duplicateAsTemplate(cfg)}
                  >
                    保存为模板
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
