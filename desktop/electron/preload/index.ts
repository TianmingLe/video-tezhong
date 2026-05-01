import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from './types'
import { ipcChannels } from '@shared/ipc'

const api: DesktopApi = {
  version: '0.0.1',
  job: {
    start: async (config) => {
      return await ipcRenderer.invoke(ipcChannels.jobStart, config)
    },
    cancel: async (runId) => {
      return await ipcRenderer.invoke(ipcChannels.jobCancel, runId)
    },
    onLog: (runId, callback) => {
      const handler = (_evt: unknown, payload: { runId: string; line: string }) => {
        if (payload.runId === runId) callback(payload.line)
      }
      ipcRenderer.on(ipcChannels.jobLog, handler as never)
      return () => ipcRenderer.removeListener(ipcChannels.jobLog, handler as never)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
