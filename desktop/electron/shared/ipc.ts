export const ipcChannels = {
  jobLog: 'job:log',
  jobStatus: 'job:status',
  jobStart: 'job:start',
  jobCancel: 'job:cancel',
  jobExportLog: 'job:exportLog',
  jobQueueStatus: 'job:queueStatus',
  jobHistory: 'job:history',
  kbList: 'kb:list',
  kbSave: 'kb:save',
  kbSetDefault: 'kb:setDefault',
  trayGetConfig: 'tray:getConfig',
  trayUpdateConfig: 'tray:updateConfig'
} as const
