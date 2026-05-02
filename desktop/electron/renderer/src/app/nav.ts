export type NavKey = 'tasks' | 'console' | 'reports' | 'kb' | 'settings'

export const navItems: Array<{ key: NavKey; label: string }> = [
  { key: 'tasks', label: '任务' },
  { key: 'console', label: '控制台' },
  { key: 'reports', label: '报告' },
  { key: 'kb', label: '知识库' },
  { key: 'settings', label: '设置' }
]

