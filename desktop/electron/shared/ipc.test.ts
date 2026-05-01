import { describe, expect, test } from 'vitest'
import { ipcChannels } from './ipc'

describe('ipcChannels', () => {
  test('has stable channel names', () => {
    expect(ipcChannels.jobLog).toBe('job:log')
    expect(ipcChannels.jobStatus).toBe('job:status')
    expect(ipcChannels.jobStart).toBe('job:start')
    expect(ipcChannels.jobCancel).toBe('job:cancel')
    expect(ipcChannels.jobExportLog).toBe('job:exportLog')
  })
})
