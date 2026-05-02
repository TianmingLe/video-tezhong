import type { NotificationConstructorOptions } from 'electron'
import { buildNotificationPayload } from '../tray/notification'

export type NotifyDeps = {
  createNotification: (
    payload: NotificationConstructorOptions
  ) => {
    onClick: (cb: () => void) => void
    show: () => void
  }
  showAndFocusWindow: () => void
  sendNavigate: (path: string) => void
}

export function runNotifyFlow(args: {
  runId: string
  exitCode: number | null
  platform: NodeJS.Platform
  deps: NotifyDeps
}) {
  const payload = buildNotificationPayload({
    runId: args.runId,
    exitCode: args.exitCode,
    platform: args.platform
  })

  const n = args.deps.createNotification(payload)
  n.onClick(() => {
    args.deps.showAndFocusWindow()
    args.deps.sendNavigate(`/report/${args.runId}`)
  })
  n.show()
}

