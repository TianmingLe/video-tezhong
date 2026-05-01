import type { MenuItemConstructorOptions } from 'electron'
import type { TrayLeftClickMode } from './types'

export function buildTrayMenuTemplate(opts: {
  platform: NodeJS.Platform
  isVisible: boolean
  hasRunningJob: boolean
  leftClickMode: TrayLeftClickMode
}): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    { id: 'toggle_window', label: opts.isVisible ? '隐藏窗口' : '显示窗口', type: 'normal' },
    { id: 'open_tasks', label: '打开任务页', type: 'normal' },
    { id: 'open_report', label: '打开报告页', type: 'normal' }
  ]

  if (opts.hasRunningJob) {
    items.splice(1, 0, { id: 'cancel_job', label: '取消当前任务', type: 'normal' })
  }

  items.push({ type: 'separator' })
  items.push({ id: 'quit', label: '退出', type: 'normal' })

  return items
}

