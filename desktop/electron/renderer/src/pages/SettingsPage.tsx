import { useEffect, useState } from 'react'
import type { ConfigRecord, TrayConfig, TrayLeftClickMode } from '../../../preload/types'

export function SettingsPage() {
  const [trayConfig, setTrayConfig] = useState<TrayConfig | null>(null)
  const [kbConfigs, setKbConfigs] = useState<ConfigRecord[]>([])
  const [kbLoading, setKbLoading] = useState(true)

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
    } finally {
      setKbLoading(false)
    }
  }

  const setDefault = async (id: number) => {
    await window.api.kb.setDefault(id)
    await refreshKb()
  }

  const duplicateAsTemplate = async (cfg: ConfigRecord) => {
    const name = window.prompt('模板名称', cfg.name)
    const trimmed = String(name || '').trim()
    if (!trimmed) return
    await window.api.kb.save({
      name: trimmed,
      script: cfg.script,
      scenario: cfg.scenario,
      gateway_ws: cfg.gateway_ws,
      env: cfg.env,
      is_default: 0
    })
    await refreshKb()
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
                  <button type="button" className="btn" disabled={cfg.is_default === 1} onClick={() => setDefault(cfg.id)}>
                    设为默认
                  </button>
                  <button type="button" className="btn" onClick={() => duplicateAsTemplate(cfg)}>
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
