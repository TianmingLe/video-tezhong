import { describe, expect, test } from 'vitest'
import { buildNotificationPayload } from './notification'

describe('buildNotificationPayload', () => {
  test('exitCode=0 => success title', () => {
    const p = buildNotificationPayload({ runId: 'test-123', exitCode: 0, platform: 'win32' })
    expect(p.title).toBe('✅ 任务完成')
    expect(p.body).toContain('test-123')
  })

  test('exitCode!=0 => failure title', () => {
    const p = buildNotificationPayload({ runId: 'test-456', exitCode: 2, platform: 'linux' })
    expect(p.title).toBe('❌ 任务失败')
    expect(p.body).toContain('test-456')
  })

  test('darwin defaults to silent', () => {
    const p = buildNotificationPayload({ runId: 'test-789', exitCode: 0, platform: 'darwin' })
    expect(p.silent).toBe(true)
  })
})

