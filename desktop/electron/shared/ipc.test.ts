import { describe, expect, test } from 'vitest'
import { ipcChannels } from './ipc'

describe('ipcChannels', () => {
  test('has stable channel names', () => {
    expect(ipcChannels.jobLog).toBe('job:log')
    expect(ipcChannels.jobStatus).toBe('job:status')
    expect(ipcChannels.jobStart).toBe('job:start')
    expect(ipcChannels.jobCancel).toBe('job:cancel')
    expect(ipcChannels.jobExportLog).toBe('job:exportLog')
    expect(ipcChannels.jobQueueStatus).toBe('job:queueStatus')
    expect(ipcChannels.jobQueueUpdate).toBe('job:queueUpdate')
    expect(ipcChannels.jobHistory).toBe('job:history')
    expect(ipcChannels.jobGetArchivedLog).toBe('job:getArchivedLog')
    expect(ipcChannels.kbList).toBe('kb:list')
    expect(ipcChannels.kbSave).toBe('kb:save')
    expect(ipcChannels.kbSetDefault).toBe('kb:setDefault')
    expect(ipcChannels.trayGetConfig).toBe('tray:getConfig')
    expect(ipcChannels.trayUpdateConfig).toBe('tray:updateConfig')
    expect(ipcChannels.appNotify).toBe('app:notify')
    expect(ipcChannels.appGetDbState).toBe('app:getDbState')
    expect(ipcChannels.updateCheck).toBe('update:check')
    expect(ipcChannels.updateInstall).toBe('update:install')
    expect(ipcChannels.updateState).toBe('update:state')
    expect(ipcChannels.updateEvent).toBe('update:event')
  })
})
