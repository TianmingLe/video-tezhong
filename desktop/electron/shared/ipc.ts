export const ipcChannels = {
  jobLog: 'job:log',
  jobStatus: 'job:status',
  jobStart: 'job:start',
  jobCancel: 'job:cancel',
  jobExportLog: 'job:exportLog',
  historyList: 'history:list',
  historyGet: 'history:get',
  templatesList: 'templates:list',
  templatesSave: 'templates:save',
  trayGetConfig: 'tray:getConfig',
  trayUpdateConfig: 'tray:updateConfig'
} as const
