import { describe, expect, test } from 'vitest'
import { ipcChannels } from './ipc'

describe('ipcChannels', () => {
  test('has stable channel names', () => {
    expect(ipcChannels.jobLog).toBe('job:log')
    expect(ipcChannels.jobStatus).toBe('job:status')
  })
})

