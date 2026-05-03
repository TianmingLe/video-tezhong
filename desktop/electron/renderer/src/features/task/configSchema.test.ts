import { describe, expect, test } from 'vitest'
import { taskConfigSchema } from './configSchema'

describe('taskConfigSchema', () => {
  test('rejects invalid script', () => {
    const r = taskConfigSchema.safeParse({
      runId: '',
      script: 'bad.py',
      scenario: 'normal',
      gatewayWs: '',
      env: {},
      advanced: { logLevel: 'info', maxLogLines: 1000, autoJumpToReport: true }
    })
    expect(r.success).toBe(false)
  })

  test('accepts minimal valid payload', () => {
    const r = taskConfigSchema.safeParse({
      runId: '',
      script: 'mock_device.py',
      scenario: 'normal',
      gatewayWs: '',
      env: {},
      advanced: { logLevel: 'info', maxLogLines: 1000, autoJumpToReport: true }
    })
    expect(r.success).toBe(true)
  })

  test('accepts mediacrawler dy_mvp payload', () => {
    const r = taskConfigSchema.safeParse({
      runId: '',
      script: 'mediacrawler',
      scenario: 'mediacrawler',
      gatewayWs: '',
      env: {},
      mediacrawler: { kind: 'dy_mvp', specifiedId: 'https://www.douyin.com/video/123', enableLlm: false },
      advanced: { logLevel: 'info', maxLogLines: 1000, autoJumpToReport: true }
    })
    expect(r.success).toBe(true)
  })
})
