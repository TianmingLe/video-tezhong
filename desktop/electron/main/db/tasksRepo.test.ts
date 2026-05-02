import { afterEach, describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDbForTest, initDb } from './index'
import { createTasksRepo } from './tasksRepo'

let tmpFile: string | null = null
let dbToClose: { close: () => void } | null = null
afterEach(() => {
  try {
    dbToClose?.close()
  } catch {}
  dbToClose = null
  try {
    if (tmpFile && fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  } catch {}
  tmpFile = null
})

function createDb() {
  tmpFile = path.join(os.tmpdir(), `omni-${Date.now()}-${Math.random()}.db`)
  const db = createDbForTest(tmpFile)
  dbToClose = db
  initDb(db)
  return db
}

describe('tasksRepo', () => {
  test('insert + getById: 可写入并读取', () => {
    const db = createDb()
    const repo = createTasksRepo(db)

    const row = repo.insert({
      run_id: 'r1',
      script: 'mock_device.py',
      scenario: 'normal',
      status: 'queued',
      exit_code: null,
      start_time: null,
      end_time: null,
      duration: null
    })

    expect(row.id).toBe(1)
    expect(repo.getById('r1')).toEqual(row)
  })

  test('updateStatus: 可更新状态及附加字段', () => {
    const db = createDb()
    const repo = createTasksRepo(db)

    repo.insert({
      run_id: 'r2',
      script: 'mock_device.py',
      scenario: 'spam',
      status: 'running',
      exit_code: null,
      start_time: 10,
      end_time: null,
      duration: null
    })

    const row = repo.updateStatus({ run_id: 'r2', status: 'exited', exit_code: 0, end_time: 20, duration: 10 })
    expect(row.status).toBe('exited')
    expect(row.exit_code).toBe(0)
    expect(row.end_time).toBe(20)
    expect(row.duration).toBe(10)
  })

  test('getAll: 按 end_time/start_time 倒序', () => {
    const db = createDb()
    const repo = createTasksRepo(db)

    repo.insert({
      run_id: 'a',
      script: 's',
      scenario: '1',
      status: 'running',
      exit_code: null,
      start_time: 10,
      end_time: null,
      duration: null
    })

    repo.insert({
      run_id: 'b',
      script: 's',
      scenario: '2',
      status: 'exited',
      exit_code: 0,
      start_time: 1,
      end_time: 20,
      duration: 19
    })

    const ids = repo.getAll().map((x) => x.run_id)
    expect(ids).toEqual(['b', 'a'])
  })
})
