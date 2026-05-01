import { describe, expect, test } from 'vitest'
import { createHistoryStore, type StoreAdapter } from './historyStore'

function createMemoryAdapter(): StoreAdapter & { dump: () => Record<string, unknown> } {
  const map = new Map<string, unknown>()
  return {
    get: (key) => map.get(key) as never,
    set: (key, value) => {
      map.set(key, value as unknown)
    },
    dump: () => Object.fromEntries(map.entries())
  }
}

describe('historyStore', () => {
  test('upsert/get: 可写入并读取', () => {
    const adapter = createMemoryAdapter()
    const store = createHistoryStore({ adapter, now: () => 1000 })

    store.upsert({
      runId: 'r1',
      scriptName: 'mock_device.py',
      scenario: 'normal',
      status: 'queued',
      exitCode: null,
      startTime: null,
      endTime: null
    })

    expect(store.get('r1')).toEqual({
      runId: 'r1',
      scriptName: 'mock_device.py',
      scenario: 'normal',
      status: 'queued',
      exitCode: null,
      startTime: null,
      endTime: null
    })
  })

  test('list: 按 endTime/startTime 倒序', () => {
    const adapter = createMemoryAdapter()
    const store = createHistoryStore({ adapter, now: () => 1000 })

    store.upsert({
      runId: 'a',
      scriptName: 's',
      scenario: '1',
      status: 'running',
      startTime: 10,
      endTime: null,
      exitCode: null
    })
    store.upsert({
      runId: 'b',
      scriptName: 's',
      scenario: '2',
      status: 'exited',
      startTime: 1,
      endTime: 20,
      exitCode: 0
    })

    const ids = store.list().map((x) => x.runId)
    expect(ids).toEqual(['b', 'a'])
  })

  test('applyStatusChange: 状态变更会补齐 startTime/endTime/exitCode', () => {
    const adapter = createMemoryAdapter()
    const store = createHistoryStore({ adapter, now: () => 123 })

    store.applyStatusChange({ runId: 'r2', status: 'queued', scriptName: 'mock_device.py', scenario: 'spam', ts: 10 })
    store.applyStatusChange({ runId: 'r2', status: 'running', ts: 20 })
    store.applyStatusChange({ runId: 'r2', status: 'running', ts: 999 })
    store.applyStatusChange({ runId: 'r2', status: 'exited', exitCode: 0, ts: 30 })

    expect(store.get('r2')).toEqual({
      runId: 'r2',
      scriptName: 'mock_device.py',
      scenario: 'spam',
      status: 'exited',
      exitCode: 0,
      startTime: 20,
      endTime: 30
    })
  })

  test('applyStatusChange: cancelled 也会写入 endTime', () => {
    const adapter = createMemoryAdapter()
    const store = createHistoryStore({ adapter, now: () => 123 })

    store.applyStatusChange({ runId: 'r3', status: 'queued', scriptName: 'mock_device.py', scenario: 'normal', ts: 1 })
    store.applyStatusChange({ runId: 'r3', status: 'cancelled', ts: 2 })

    expect(store.get('r3')?.status).toBe('cancelled')
    expect(store.get('r3')?.endTime).toBe(2)
  })
})

