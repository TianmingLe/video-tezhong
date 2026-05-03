import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from './types'
import { ipcChannels } from '@shared/ipc'

const api: DesktopApi = {
  version: '0.0.1',
  onboarding: {
    getState: async () => {
      return await ipcRenderer.invoke(ipcChannels.onboardingGet)
    },
    complete: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.onboardingComplete, input ?? {})
    },
    reset: async () => {
      return await ipcRenderer.invoke(ipcChannels.onboardingReset)
    }
  },
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
    },
    listRunArtifacts: async (runId) => {
      return await ipcRenderer.invoke(ipcChannels.jobListRunArtifacts, { runId })
    },
    readRunFile: async (runId, name, maxBytes) => {
      return await ipcRenderer.invoke(ipcChannels.jobReadRunFile, { runId, name, maxBytes })
    }
  },
  llm: {
    getConfig: async () => {
      return await ipcRenderer.invoke(ipcChannels.llmGetConfig)
    },
    setConfig: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.llmSetConfig, input ?? {})
    }
  },
  llmChat: async (input) => {
    return await ipcRenderer.invoke(ipcChannels.llmChat, input ?? {})
  },
  aggregate: {
    save: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.aggregateSave, input ?? {})
    },
    list: async () => {
      return await ipcRenderer.invoke(ipcChannels.aggregateList)
    },
    readFile: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.aggregateReadFile, input ?? {})
    },
    delete: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.aggregateDelete, input ?? {})
    },
    export: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.aggregateExport, input ?? {})
    }
  },
  cluster: {
    save: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.clusterSave, input ?? {})
    },
    list: async () => {
      return await ipcRenderer.invoke(ipcChannels.clusterList)
    },
    readFile: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.clusterReadFile, input ?? {})
    },
    delete: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.clusterDelete, input ?? {})
    },
    export: async (input) => {
      return await ipcRenderer.invoke(ipcChannels.clusterExport, input ?? {})
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
  logs: {
    cleanupPreview: async (args) => {
      return await ipcRenderer.invoke(ipcChannels.logsCleanupPreview, args ?? {})
    },
    cleanup: async (args) => {
      return await ipcRenderer.invoke(ipcChannels.logsCleanup, args ?? {})
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
    },
    onNotify: (callback) => {
      const handler = (_evt: unknown, payload: unknown) => callback(payload as never)
      ipcRenderer.on(ipcChannels.appNotify, handler as never)
      return () => ipcRenderer.removeListener(ipcChannels.appNotify, handler as never)
    },
    getDbState: async () => {
      return await ipcRenderer.invoke(ipcChannels.appGetDbState)
    },
    uninstall: async () => {
      return await ipcRenderer.invoke(ipcChannels.appUninstall)
    }
  },
  update: {
    check: async () => {
      return await ipcRenderer.invoke(ipcChannels.updateCheck)
    },
    install: async () => {
      return await ipcRenderer.invoke(ipcChannels.updateInstall)
    },
    getState: async () => {
      return await ipcRenderer.invoke(ipcChannels.updateState)
    },
    onEvent: (callback) => {
      const handler = (_evt: unknown, payload: unknown) => callback(payload as never)
      ipcRenderer.on(ipcChannels.updateEvent, handler as never)
      return () => ipcRenderer.removeListener(ipcChannels.updateEvent, handler as never)
    }
  },
  system: {
    checkPython: async () => {
      return await ipcRenderer.invoke(ipcChannels.systemCheckPython)
    }
  },
  perf: {
    getStartup: async () => {
      return await ipcRenderer.invoke(ipcChannels.perfGetStartup)
    }
  },
  feedback: {
    collectBundle: async (args) => {
      return await ipcRenderer.invoke(ipcChannels.feedbackCollectBundle, { userDescription: args?.userDescription ?? '' })
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
