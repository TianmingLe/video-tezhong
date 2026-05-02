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
    },
    onStatus: (runId, callback) => {
      const handler = (_evt: unknown, payload: { runId: string }) => {
        if (payload.runId === runId) callback(payload as never)
      }
      ipcRenderer.on(ipcChannels.jobStatus, handler as never)
      return () => ipcRenderer.removeListener(ipcChannels.jobStatus, handler as never)
    },
    onQueueUpdate: (callback) => {
      const handler = (_evt: unknown, payload: unknown) => callback(payload as never)
      ipcRenderer.on(ipcChannels.jobQueueUpdate, handler as never)
      return () => ipcRenderer.removeListener(ipcChannels.jobQueueUpdate, handler as never)
    },
    exportLog: async (runId) => {
      return await ipcRenderer.invoke(ipcChannels.jobExportLog, runId)
    },
    queueStatus: async () => {
      return await ipcRenderer.invoke(ipcChannels.jobQueueStatus)
    },
    history: async () => {
      return await ipcRenderer.invoke(ipcChannels.jobHistory)
    },
    getArchivedLog: async (runId, offset, chunkSize) => {
      return await ipcRenderer.invoke(ipcChannels.jobGetArchivedLog, { runId, offset, chunkSize })
    }
  },
  kb: {
    list: async () => {
      return await ipcRenderer.invoke(ipcChannels.kbList)
    },
    save: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.kbSave, input)
    },
    setDefault: async (id) => {
      return await ipcRenderer.invoke(ipcChannels.kbSetDefault, id)
    }
  },
  tray: {
    getConfig: async () => {
      return await ipcRenderer.invoke(ipcChannels.trayGetConfig)
    },
    updateConfig: async (partial) => {
      return await ipcRenderer.invoke(ipcChannels.trayUpdateConfig, partial)
    }
  },
  app: {
    onNavigate: (callback) => {
      const handler = (_evt: unknown, payload: { path: string }) => callback(payload)
      ipcRenderer.on('app:navigate', handler as never)
      return () => ipcRenderer.removeListener('app:navigate', handler as never)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
