import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ConfigRecord, TrayConfig, TrayLeftClickMode, UpdateValidationResult, DiagnosticsResult, DiagnosticCheck } from '../../../preload/types'
import { RetryButton } from '../components/RetryButton'
import { useDbState } from '../contexts/DbStateContext'
import { toastStore } from '../components/toast/toastStore'
import { copyText } from '../features/feedback/copyText'
import { llmConfigSchema } from '../features/llm/llmConfigSchema'

export function SettingsPage() {
  const navigate = useNavigate()
  const { isReadOnly } = useDbState()
  const isWindows = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
  const [trayConfig, setTrayConfig] = useState<TrayConfig | null>(null)
  const [llmApiBaseUrl, setLlmApiBaseUrl] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmHasKey, setLlmHasKey] = useState(false)
  const [llmEncryptionAvailable, setLlmEncryptionAvailable] = useState(false)
  const [llmKeyStorage, setLlmKeyStorage] = useState<'safeStorage' | 'plain' | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [kbConfigs, setKbConfigs] = useState<ConfigRecord[]>([])
  const [kbLoading, setKbLoading] = useState(true)
  const [kbError, setKbError] = useState<{ message: string; retry: () => Promise<void> } | null>(null)
  const [startupPerf, setStartupPerf] = useState<Awaited<ReturnType<typeof window.api.perf.getStartup>> | null>(null)
  const [startupPerfLoading, setStartupPerfLoading] = useState(false)
  const [startupPerfError, setStartupPerfError] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackDesc, setFeedbackDesc] = useState('')
  const [feedbackGenerating, setFeedbackGenerating] = useState(false)
  const [updateValidation, setUpdateValidation] = useState<UpdateValidationResult | null>(null)
  const [updateValidationLoading, setUpdateValidationLoading] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)

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
    setLlmLoading(true)
    window.api.llm
      .getConfig()
      .then((cfg) => {
        if (cancelled) return
        setLlmApiBaseUrl(cfg.apiBaseUrl || '')
        setLlmModel(cfg.model || '')
        setLlmHasKey(Boolean(cfg.hasKey))
        setLlmEncryptionAvailable(Boolean(cfg.encryptionAvailable))
        setLlmKeyStorage(cfg.keyStorage ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        setLlmLoading(false)
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

  const checkUpdate = async () => {
    const checkingToastId = toastStore.show({ title: '更新', message: '正在检查更新…' })
    try {
      const state = await window.api.update.check()
      if (state.status === 'checking') return
      toastStore.dismiss(checkingToastId)

      if (state.status === 'notAvailable') {
        toastStore.show({ title: '更新', message: '当前已是最新版本' })
        return
      }
      if (state.status === 'available' || state.status === 'downloading') {
        toastStore.show({ title: '更新', message: '发现新版本，正在下载…' })
        return
      }
      if (state.status === 'downloaded') {
        toastStore.show({ title: '更新', message: '更新已下载完成' })
        return
      }
      if (state.status === 'error') {
        toastStore.show({ title: '更新', message: `检查更新失败：${state.error}` })
        return
      }
      toastStore.show({ title: '更新', message: `更新状态：${state.status}` })
    } catch (e) {
      toastStore.dismiss(checkingToastId)
      toastStore.show({ title: '更新', message: `检查更新失败：${String((e as Error)?.message || e)}` })
    }
  }

  const validateUpdate = async () => {
    setUpdateValidationLoading(true)
    try {
      const result = await window.api.update.validate()
      setUpdateValidation(result)
    } catch (e) {
      toastStore.show({ title: '更新配置检查', message: `检查失败：${String((e as Error)?.message || e)}` })
    } finally {
      setUpdateValidationLoading(false)
    }
  }

  const runDiagnostics = async () => {
    setDiagnosticsLoading(true)
    try {
      const result = await window.api.system.runDiagnostics()
      setDiagnostics(result)
    } catch (e) {
      toastStore.show({ title: '诊断', message: `运行失败：${String((e as Error)?.message || e)}` })
    } finally {
      setDiagnosticsLoading(false)
    }
  }

  const statusColor = (status: DiagnosticCheck['status']) => {
    if (status === 'ok') return 'var(--accent-success)'
    if (status === 'warning') return 'var(--accent-warning)'
    return 'var(--accent-danger)'
  }

  const statusIcon = (status: DiagnosticCheck['status']) => {
    if (status === 'ok') return '✓'
    if (status === 'warning') return '⚠'
    return '✕'
  }

  const restartOnboarding = async () => {
    try {
      await window.api.onboarding.reset()
      navigate('/onboarding', { replace: true })
    } catch (e) {
      toastStore.show({ title: '引导', message: `重置失败：${String((e as Error)?.message || e)}` })
    }
  }

  const cleanupOldLogs = async () => {
    const scanningToastId = toastStore.show({ title: '日志', message: '正在扫描日志…' })
    try {
      const preview = await window.api.logs.cleanupPreview({ keep: 50 })
      toastStore.dismiss(scanningToastId)

      if (!preview.toDelete) {
        toastStore.show({ title: '日志', message: '没有可清理的旧日志' })
        return
      }

      const ok = window.confirm(`将删除 ${preview.toDelete} 个 .log 文件，不可恢复`)
      if (!ok) return

      const cleaningToastId = toastStore.show({ title: '日志', message: '正在清理旧日志…' })
      const res = await window.api.logs.cleanup({ keep: 50 })
      toastStore.dismiss(cleaningToastId)

      if (res.success) {
        toastStore.show({ title: '日志', message: `已删除 ${res.deleted} 个 .log 文件` })
        return
      }
      toastStore.show({ title: '日志', message: `清理失败：${res.error}` })
    } catch (e) {
      toastStore.dismiss(scanningToastId)
      toastStore.show({ title: '日志', message: `清理失败：${String((e as Error)?.message || e)}` })
    }
  }

  const uninstallApp = async () => {
    const ok = window.confirm('将启动卸载程序并退出应用，是否继续？')
    if (!ok) return
    const toastId = toastStore.show({ title: '卸载', message: '正在启动卸载程序…' })
    try {
      const res = await window.api.app.uninstall()
      toastStore.dismiss(toastId)
      if (res.success) return
      toastStore.show({ title: '卸载', message: `启动失败：${res.error}` })
    } catch (e) {
      toastStore.dismiss(toastId)
      toastStore.show({ title: '卸载', message: `启动失败：${String((e as Error)?.message || e)}` })
    }
  }

  const loadStartupPerf = async () => {
    setStartupPerfLoading(true)
    try {
      const res = await window.api.perf.getStartup()
      setStartupPerf(res)
      setStartupPerfError(null)
    } catch (e) {
      setStartupPerfError(String((e as Error)?.message || e))
    } finally {
      setStartupPerfLoading(false)
    }
  }

  const formatMs = (v: unknown) => {
    const n = typeof v === 'number' ? v : null
    return n == null || !Number.isFinite(n) ? '-' : `${Math.round(n)}ms`
  }

  const generateFeedback = async () => {
    if (feedbackGenerating) return
    setFeedbackGenerating(true)
    const loadingToastId = toastStore.show({ title: '反馈', message: '正在生成…' })
    try {
      const { markdown } = await window.api.feedback.collectBundle({ userDescription: feedbackDesc })
      const res = await copyText(markdown)
      toastStore.dismiss(loadingToastId)
      if (res.success) {
        toastStore.show({ title: '反馈', message: '已复制到剪贴板，请前往 GitHub 粘贴' })
        return
      }
      toastStore.show({ title: '反馈', message: `复制失败：${res.error}` })
    } catch (e) {
      toastStore.dismiss(loadingToastId)
      toastStore.show({ title: '反馈', message: `生成失败：${String((e as Error)?.message || e)}` })
    } finally {
      setFeedbackGenerating(false)
    }
  }

  const saveLlm = async () => {
    if (llmLoading) return
    const parsed = llmConfigSchema.safeParse({ apiBaseUrl: llmApiBaseUrl, model: llmModel, apiKey: llmApiKey || undefined })
    if (!parsed.success) {
      toastStore.show({ title: 'LLM', message: '请填写 Base URL / Model' })
      return
    }
    if (!llmHasKey && !llmApiKey) {
      toastStore.show({ title: 'LLM', message: '请填写 API Key' })
      return
    }
    const toastId = toastStore.show({ title: 'LLM', message: '正在保存…' })
    setLlmLoading(true)
    try {
      const res = await window.api.llm.setConfig({ apiBaseUrl: parsed.data.apiBaseUrl, model: parsed.data.model, apiKey: parsed.data.apiKey })
      toastStore.dismiss(toastId)
      setLlmHasKey(Boolean(res.hasKey))
      setLlmEncryptionAvailable(Boolean(res.encryptionAvailable))
      setLlmKeyStorage(res.keyStorage ?? null)
      setLlmApiKey('')
      toastStore.show({ title: 'LLM', message: '已保存' })
    } catch (e) {
      toastStore.dismiss(toastId)
      toastStore.show({ title: 'LLM', message: `保存失败：${String((e as Error)?.message || e)}` })
    } finally {
      setLlmLoading(false)
    }
  }

  const clearLlmKey = async () => {
    const ok = window.confirm('将清除已保存的 API Key，是否继续？')
    if (!ok) return
    if (!llmApiBaseUrl.trim() || !llmModel.trim()) {
      toastStore.show({ title: 'LLM', message: '请先填写 Base URL / Model' })
      return
    }
    const toastId = toastStore.show({ title: 'LLM', message: '正在清除…' })
    setLlmLoading(true)
    try {
      const res = await window.api.llm.setConfig({ apiBaseUrl: llmApiBaseUrl, model: llmModel, apiKey: '' })
      toastStore.dismiss(toastId)
      setLlmHasKey(Boolean(res.hasKey))
      setLlmEncryptionAvailable(Boolean(res.encryptionAvailable))
      setLlmKeyStorage(res.keyStorage ?? null)
      setLlmApiKey('')
      toastStore.show({ title: 'LLM', message: '已清除' })
    } catch (e) {
      toastStore.dismiss(toastId)
      toastStore.show({ title: 'LLM', message: `清除失败：${String((e as Error)?.message || e)}` })
    } finally {
      setLlmLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">设置</h1>
        <p className="page-subtitle">管理应用配置、系统设置和用户偏好</p>
      </div>

      <div className="grid" style={{ marginTop: 24 }}>
        <div>
          <div className="section-title">应用更新</div>
          <div className="card">
            <div className="toolbar">
              <button type="button" className="btn" onClick={checkUpdate}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                </svg>
                检查更新
              </button>
              <button type="button" className="btn" onClick={validateUpdate} disabled={updateValidationLoading}>
                更新配置检查
              </button>
            </div>
            {updateValidation ? (
              <div style={{ marginTop: 12 }}>
                {updateValidation.ok ? (
                  <div className="badge badge-success" style={{ display: 'inline-flex', gap: 6 }}>
                    <span>✓</span> 配置正常
                  </div>
                ) : (
                  <div className="badge badge-danger" style={{ display: 'inline-flex', gap: 6 }}>
                    <span>✕</span> {updateValidation.errors.join('；')}
                  </div>
                )}
                {updateValidation.warnings.length > 0 ? (
                  <div className="badge badge-warning" style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
                    <span>⚠</span> {updateValidation.warnings.join('；')}
                  </div>
                ) : null}
                {updateValidation.feedURL ? (
                  <div className="muted" style={{ marginTop: 8 }}>feedURL：{updateValidation.feedURL}</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="section-title" style={{ marginTop: 24 }}>系统与诊断</div>
          <div className="card">
            <div className="toolbar">
              <button type="button" className="btn" onClick={runDiagnostics} disabled={diagnosticsLoading}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                {diagnosticsLoading ? '诊断中…' : '运行诊断'}
              </button>
            </div>
            {diagnostics ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, color: statusColor(diagnostics.overall_status), display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{statusIcon(diagnostics.overall_status)}</span>
                  {diagnostics.summary}
                </div>
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  {diagnostics.checks.map((c) => (
                    <div key={c.name} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 10, background: statusColor(c.status), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#000' }}>
                        {statusIcon(c.status)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{c.detail}</div>
                        {c.suggestion ? (
                          <div style={{ fontSize: 11, color: 'var(--accent-danger)', marginTop: 2 }}>{c.suggestion}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="section-title" style={{ marginTop: 24 }}>系统操作</div>
          <div className="card">
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="toolbar">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>引导重置</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>重新开始初始设置流程</div>
                </div>
                <button type="button" className="btn" onClick={restartOnboarding}>
                  重新开始引导
                </button>
              </div>
              <div className="toolbar">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>日志清理</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>删除旧的日志文件以释放空间</div>
                </div>
                <button type="button" className="btn" onClick={cleanupOldLogs}>
                  清理旧日志
                </button>
              </div>
              {isWindows ? (
                <div className="toolbar">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>卸载应用</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>从系统中移除应用及其数据</div>
                  </div>
                  <button type="button" className="btn btn-danger" onClick={uninstallApp}>
                    卸载应用
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div>
          <div className="section-title">AI 模型配置</div>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(88, 166, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                  <circle cx="12" cy="12" r="6" />
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>LLM</div>
                <div style={{ fontSize: 11 }}>
                  {llmEncryptionAvailable ? (
                    <span className="badge badge-success" style={{ fontSize: 10 }}>加密存储可用</span>
                  ) : (
                    <span className="badge badge-warning" style={{ fontSize: 10 }}>加密存储不可用</span>
                  )}
                  <span className="muted" style={{ marginLeft: 6 }}>Key：{llmHasKey ? '已保存' : '未保存'}</span>
                </div>
              </div>
            </div>
            <div className="row">
              <label className="label">Base URL</label>
              <input className="input" value={llmApiBaseUrl} onChange={(e) => setLlmApiBaseUrl(e.target.value)} disabled={llmLoading} placeholder="https://api.openai.com/v1" />
            </div>
            <div className="row">
              <label className="label">Model</label>
              <input className="input" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} disabled={llmLoading} placeholder="gpt-4o-mini" />
            </div>
            <div className="row">
              <label className="label">API Key</label>
              <input
                className="input"
                type="password"
                placeholder={llmHasKey ? '已保存（留空不修改）' : 'sk-...'}
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                disabled={llmLoading}
              />
            </div>
            <div className="row" style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={saveLlm} disabled={llmLoading}>
                保存配置
              </button>
              <button type="button" className="btn" onClick={clearLlmKey} disabled={llmLoading || !llmHasKey}>
                清除 Key
              </button>
              {isReadOnly ? (
                <div className="muted" style={{ alignSelf: 'center', fontSize: 11 }}>
                  数据库只读模式
                </div>
              ) : null}
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 24 }}>托盘设置</div>
          <div className="card">
            <div className="row">
              <label className="label">左键点击行为</label>
              <select
                className="input"
                value={trayConfig?.leftClick ?? ''}
                disabled={!trayConfig}
                onChange={(e) => updateLeftClick(e.target.value as TrayLeftClickMode)}
              >
                <option value="" disabled>
                  选择行为…
                </option>
                <option value="menu">弹出菜单</option>
                <option value="toggle">显示/隐藏窗口</option>
                <option value="none">无操作</option>
              </select>
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 24 }}>反馈</div>
          <div className="card">
            {feedbackOpen ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="row">
                  <label className="label">问题描述（可选）</label>
                  <textarea
                    className="input"
                    style={{ minHeight: 100, resize: 'vertical' }}
                    value={feedbackDesc}
                    placeholder="请描述你遇到的问题"
                    onChange={(e) => setFeedbackDesc(e.target.value)}
                  />
                </div>
                <div className="row" style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={generateFeedback} disabled={feedbackGenerating}>
                    {feedbackGenerating ? '生成中…' : '生成并复制'}
                  </button>
                  <button type="button" className="btn" onClick={() => setFeedbackOpen(false)}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="toolbar">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>遇到问题？</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>生成诊断信息并复制到剪贴板</div>
                </div>
                <button type="button" className="btn" onClick={() => setFeedbackOpen(true)}>
                  反馈问题
                </button>
              </div>
            )}
          </div>

          <details
            className="card"
            style={{ marginTop: 24 }}
            onToggle={(e) => {
              const el = e.currentTarget
              if (el.open && !startupPerf && !startupPerfLoading) void loadStartupPerf()
            }}
          >
            <summary className="label" style={{ cursor: 'pointer', marginBottom: 0, fontSize: 14, fontWeight: 600 }}>
              开发者指标
            </summary>
            <div style={{ marginTop: 12 }}>
              <div className="toolbar">
                <button type="button" className="btn btn-sm" onClick={loadStartupPerf} disabled={startupPerfLoading}>
                  刷新
                </button>
                {startupPerfLoading ? <div className="muted">加载中…</div> : null}
              </div>
              {startupPerfError ? <div className="muted" style={{ marginTop: 8 }}>加载失败：{startupPerfError}</div> : null}
              {startupPerf ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                  {[
                    { label: 'whenReady', value: startupPerf.deltas.whenReady },
                    { label: 'createWindow', value: startupPerf.deltas.createWindow },
                    { label: 'didFinishLoad', value: startupPerf.deltas.didFinishLoad },
                    { label: 'readyToShow', value: startupPerf.deltas.readyToShow }
                  ].map((item) => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                      <span className="muted">{item.label}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{formatMs(item.value)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </div>

      <div className="section-title" style={{ marginTop: 32 }}>任务模板</div>
      <div className="card">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>已保存的模板</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>快速启动常用任务配置</div>
          </div>
          <button type="button" className="btn" onClick={refreshKb} disabled={kbLoading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            刷新
          </button>
        </div>

        {kbError ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="muted" style={{ color: 'var(--accent-danger)' }}>操作失败：{kbError.message}</div>
            <RetryButton label="重试" onRetry={kbError.retry} />
          </div>
        ) : null}

        {kbLoading ? (
          <div className="muted">加载中…</div>
        ) : kbConfigs.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <div className="empty-state-title">暂无模板</div>
            <div className="empty-state-description">在任务页面配置后可保存为模板</div>
          </div>
        ) : (
          <div className="list">
            {kbConfigs.map((cfg) => (
              <div key={cfg.id} className="list-item" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div className="list-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {cfg.name}
                      {cfg.is_default === 1 && <span className="badge badge-success" style={{ fontSize: 10 }}>默认</span>}
                    </div>
                    <div className="list-subtitle">
                      {cfg.script} · {cfg.scenario} {cfg.gateway_ws ? `· ${cfg.gateway_ws}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={isReadOnly || cfg.is_default === 1}
                      onClick={() => setDefault(cfg.id)}
                    >
                      设为默认
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={isReadOnly}
                      onClick={() => duplicateAsTemplate(cfg)}
                    >
                      保存模板
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
