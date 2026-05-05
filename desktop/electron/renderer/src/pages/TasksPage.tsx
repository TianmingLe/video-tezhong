import { useEffect, useMemo, useState } from 'react'
import { TaskController } from '../features/task/TaskController'
import type { TaskConfig } from '../features/task/configSchema'
import { useQueueStatus } from '../contexts/QueueStatusContext'
import { QueueStatusCard } from '../components/QueueStatusCard'

type Preset = { script: TaskConfig['script']; scenario: string; gatewayWs?: string; env?: Record<string, string> }

function readPreset(): Preset | null {
  try {
    const raw = sessionStorage.getItem('taskPreset')
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Record<string, unknown>
    const script = String(o.script || '') as TaskConfig['script']
    const scenario = String(o.scenario || '')
    const gatewayWs = typeof o.gatewayWs === 'string' ? o.gatewayWs : ''
    const envRaw = o.env
    const env =
      envRaw && typeof envRaw === 'object' && !Array.isArray(envRaw)
        ? Object.fromEntries(Object.entries(envRaw as Record<string, unknown>).map(([k, v]) => [String(k), String(v ?? '')]))
        : {}
    if (!script || !scenario) return null
    return { script, scenario, gatewayWs, env }
  } catch {
    return null
  }
}

export function TasksPage() {
  const [preset, setPreset] = useState<Preset | null>(null)
  const queue = useQueueStatus()

  useEffect(() => {
    setPreset(readPreset())
  }, [])

  const initial = useMemo(() => {
    if (!preset) return undefined
    return { script: preset.script, scenario: preset.scenario, gatewayWs: preset.gatewayWs ?? '', env: preset.env ?? {} }
  }, [preset])

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <h1 className="page-title">任务管理</h1>
            <p className="page-subtitle">创建和监控数据采集任务，支持多种脚本和平台</p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <QueueStatusCard status={queue.status} loading={queue.loading} maxConcurrency={2} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 14 }}>新建任务</span>
        </div>
        <TaskController
          initial={initial}
          onConfigCommitted={() => {
            sessionStorage.removeItem('taskPreset')
          }}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="section-title">快速入门</div>
        <div className="grid-3">
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(88, 166, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <span style={{ fontWeight: 600, fontSize: 13 }}>抖音采集</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              采集抖音视频详情、评论，支持账号登录和代理池
            </p>
          </div>
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(163, 113, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <span style={{ fontWeight: 600, fontSize: 13 }}>小红书搜索</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              按关键词搜索小红书笔记和用户，支持批量处理
            </p>
          </div>
          <div className="card" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(63, 185, 80, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <span style={{ fontWeight: 600, fontSize: 13 }}>B站视频</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              采集B站视频信息、弹幕和评论，支持字幕下载
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
