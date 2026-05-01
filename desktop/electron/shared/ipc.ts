export const ipcChannels = {
  jobLog: 'job:log',
  jobStatus: 'job:status',
  jobStart: 'job:start',
  jobCancel: 'job:cancel',
  jobExportLog: 'job:exportLog',
  trayGetConfig: 'tray:getConfig',
  trayUpdateConfig: 'tray:updateConfig'
} as const
