import type { NotificationConstructorOptions } from 'electron'

export function buildNotificationPayload(ctx: {
  runId: string
  exitCode: number | null
  platform: NodeJS.Platform
}): NotificationConstructorOptions {
  const ok = ctx.exitCode === 0
  const title = ok ? '✅ 任务完成' : '❌ 任务失败'
  const body = `RunID: ${ctx.runId}\n点击查看详情`
  const silent = ctx.platform === 'darwin'
  return { title, body, silent }
}

