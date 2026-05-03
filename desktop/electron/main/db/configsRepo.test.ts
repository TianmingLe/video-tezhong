import { afterEach, describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDbForTest, initDb } from './index'
import { createConfigsRepo } from './configsRepo'

let tmpFile: string | null = null
afterEach(() => {
  if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  tmpFile = null
})

function createDb() {
  tmpFile = path.join(os.tmpdir(), `omni-${Date.now()}-${Math.random()}.db`)
  const db = createDbForTest(tmpFile)
  initDb(db)
  return db
}

describe('configsRepo', () => {
  test('insert + getAll: 可写入并读取', () => {
    const db = createDb()
    const repo = createConfigsRepo(db)

    const a = repo.insert({
      name: 'A',
      script: 'mock_device.py',
      scenario: 'normal',
      gateway_ws: null,
      env: '{}',
      is_default: 0,
      task_spec_json: '{"kind":"dy_mvp"}'
    } as any)
    const b = repo.insert({
      name: 'B',
      script: 'e2e_test.py',
      scenario: 'spam',
      gateway_ws: 'ws://localhost',
      env: '{"K":"V"}',
      is_default: 0
    })

    expect(a.id).toBe(1)
    expect(b.id).toBe(2)
    expect(a.task_spec_json).toBe('{"kind":"dy_mvp"}')
    const ids = repo.getAll().map((x) => x.id)
    expect(ids).toEqual([2, 1])
  })

  test('update: 可更新字段', () => {
    const db = createDb()
    const repo = createConfigsRepo(db)

    const a = repo.insert({
      name: 'A',
      script: 'mock_device.py',
      scenario: 'normal',
      gateway_ws: null,
      env: '{}',
      is_default: 0
    })

    const updated = repo.update({ id: a.id, name: 'A2', env: '{"X":"1"}', gateway_ws: 'ws://x' })
    expect(updated.name).toBe('A2')
    expect(updated.env).toBe('{"X":"1"}')
    expect(updated.gateway_ws).toBe('ws://x')
  })

  test('setDefault: 确保只有一个 default', () => {
    const db = createDb()
    const repo = createConfigsRepo(db)

    const a = repo.insert({
      name: 'A',
      script: 'mock_device.py',
      scenario: 'normal',
      gateway_ws: null,
      env: '{}',
      is_default: 0
    })
    const b = repo.insert({
      name: 'B',
      script: 'e2e_test.py',
      scenario: 'spam',
      gateway_ws: null,
      env: '{}',
      is_default: 0
    })

    repo.setDefault(a.id)
    repo.setDefault(b.id)

    const defaults = repo.getAll().filter((x) => x.is_default === 1)
    expect(defaults.map((x) => x.id)).toEqual([b.id])
  })

  test('setDefault: 不存在 id 会抛错', () => {
    const db = createDb()
    const repo = createConfigsRepo(db)
    expect(() => repo.setDefault(999)).toThrow(/not found/i)
  })
})
