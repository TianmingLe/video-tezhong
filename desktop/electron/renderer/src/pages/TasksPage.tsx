import { useEffect, useMemo, useState } from 'react'
import { TaskController } from '../features/task/TaskController'
import type { TaskConfig } from '../features/task/configSchema'

type Preset = { script: TaskConfig['script']; scenario: string }

function readPreset(): Preset | null {
  try {
    const raw = sessionStorage.getItem('taskPreset')
    if (!raw) return null
    return JSON.parse(raw) as Preset
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
    return { script: preset.script, scenario: preset.scenario }
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
