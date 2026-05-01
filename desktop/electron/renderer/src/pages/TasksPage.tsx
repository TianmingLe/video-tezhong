import { useEffect, useMemo, useState } from 'react'
import { TaskController } from '../features/task/TaskController'
import type { TaskConfig } from '../features/task/configSchema'

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

  useEffect(() => {
    setPreset(readPreset())
  }, [])

  const initial = useMemo(() => {
    if (!preset) return undefined
    return { script: preset.script, scenario: preset.scenario, gatewayWs: preset.gatewayWs ?? '', env: preset.env ?? {} }
  }, [preset])

  return (
    <div className="page">
      <h1 className="page-title">任务</h1>
      <p className="page-subtitle">配置 → 启动 → 日志 → 退出 → 报告联动</p>
      <div style={{ marginTop: 16 }}>
        <TaskController
          initial={initial}
          onConfigCommitted={() => {
            sessionStorage.removeItem('taskPreset')
          }}
        />
      </div>
    </div>
  )
}
