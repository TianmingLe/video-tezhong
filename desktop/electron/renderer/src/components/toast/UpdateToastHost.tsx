import { useEffect, useRef } from 'react'
import type { UpdateEvent, UpdateState } from '../../../../preload/types'
import { toastStore } from './toastStore'

const SNOOZE_KEY = 'snoozeUntil'
const DAY_MS = 24 * 60 * 60 * 1000

export function UpdateToastHost() {
  const lastStatusRef = useRef<UpdateState['status'] | null>(null)

  useEffect(() => {
    const off = window.api.update.onEvent((ev: UpdateEvent) => {
      if (ev.name !== 'state') return
      const status = ev.state.status
      const prev = lastStatusRef.current
      lastStatusRef.current = status

      if (status !== 'downloaded' || prev === 'downloaded') return

      try {
        const raw = localStorage.getItem(SNOOZE_KEY)
        const until = Number(raw || 0)
        if (Number.isFinite(until) && until > Date.now()) return
      } catch {
      }

      let toastId = ''
      toastId = toastStore.show({
        title: '更新已下载',
        message: '新版本已下载完成，可以立即重启安装。',
        actions: [
          {
            label: '立即重启',
            onClick: () => {
              toastStore.dismiss(toastId)
              void window.api.update.install()
            }
          },
          {
            label: '稍后提醒',
            onClick: () => {
              toastStore.dismiss(toastId)
              try {
                localStorage.setItem(SNOOZE_KEY, String(Date.now() + DAY_MS))
              } catch {
              }
            }
          }
        ]
      })
    })
    return () => off()
  }, [])

  return null
}
