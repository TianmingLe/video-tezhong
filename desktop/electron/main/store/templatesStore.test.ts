import { describe, expect, test, vi } from 'vitest'
import { createTemplatesStore, type StoreAdapter } from './templatesStore'

function createMemAdapter(): StoreAdapter & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return {
    data,
    get: <T,>(key: string) => data.get(key) as T | undefined,
    set: <T,>(key: string, value: T) => {
      data.set(key, value)
    }
  }
}

describe('templatesStore', () => {
  test('list: 空返回 []', () => {
    const adapter = createMemAdapter()
    const store = createTemplatesStore({ adapter, key: 'k' })
    expect(store.list()).toEqual([])
  })

  test('save + list: 生成 id/createdAt，并写入 adapter', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'))

    const adapter = createMemAdapter()
    const key = 'k'
    const store = createTemplatesStore({ adapter, key, now: () => Date.now(), generateId: () => 'tpl-1' })

    const tpl = store.save({
      title: '  模板 A  ',
      tags: [' x ', '', 'y'],
      config: { scriptName: 'mock_device.py', scenario: 'normal' }
    })

    expect(tpl.id).toBe('tpl-1')
    expect(tpl.createdAt).toBe(new Date('2026-01-02T03:04:05.000Z').getTime())
    expect(tpl.title).toBe('模板 A')
    expect(tpl.tags).toEqual(['x', 'y'])

    const list = store.list()
    expect(list).toEqual([tpl])

    const raw = adapter.data.get(key)
    expect(raw).toEqual([tpl])

    vi.useRealTimers()
  })

  test('save: 新增项位于列表最前', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    const adapter = createMemAdapter()
    const key = 'k'
    let n = 0
    const store = createTemplatesStore({
      adapter,
      key,
      now: () => Date.now(),
      generateId: () => `tpl-${++n}`
    })

    const a = store.save({ title: 'A', tags: [], config: { scriptName: 's1', scenario: 'c1' } })
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
    const b = store.save({ title: 'B', tags: [], config: { scriptName: 's2', scenario: 'c2' } })

    const list = store.list()
    expect(list.map((t) => t.id)).toEqual([b.id, a.id])
    expect(list[0]?.createdAt).toBeGreaterThan(list[1]?.createdAt ?? 0)

    vi.useRealTimers()
  })

  test('list: 过滤无效数据', () => {
    const adapter = createMemAdapter()
    const key = 'k'
    adapter.set(key, [
      null,
      { id: 'x', title: 'ok', tags: ['t'], createdAt: 1, config: { scriptName: 's', scenario: 'c' } },
      { id: '', title: 'bad', tags: [], createdAt: 1, config: { scriptName: 's', scenario: 'c' } },
      { id: 'y', title: 'bad2', tags: [], createdAt: '1', config: { scriptName: 's', scenario: 'c' } }
    ])

    const store = createTemplatesStore({ adapter, key })
    expect(store.list()).toEqual([{ id: 'x', title: 'ok', tags: ['t'], createdAt: 1, config: { scriptName: 's', scenario: 'c' } }])
  })
})
