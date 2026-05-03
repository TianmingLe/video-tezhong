import { afterEach, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDbForTest, initDb } from './index'

let tmpFile: string | null = null
let dbToClose: { close: () => void } | null = null
const sleepArray = new Int32Array(new SharedArrayBuffer(4))

function unlinkWithRetry(filePath: string) {
  for (let i = 0; i < 8; i += 1) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return
    } catch (e) {
      if (i >= 7) throw e
      Atomics.wait(sleepArray, 0, 0, 50)
    }
  }
}

afterEach(() => {
  try {
    dbToClose?.close()
  } catch {}
  dbToClose = null
  if (tmpFile) unlinkWithRetry(tmpFile)
  tmpFile = null
})

test('initDb creates tables and supports insert/select', () => {
  tmpFile = path.join(os.tmpdir(), `omni-${Date.now()}-${Math.random()}.db`)
  const db = createDbForTest(tmpFile)
  dbToClose = db as any
  initDb(db)

  const tasksCols = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((r) => r.name)
  const configsCols = (db.prepare('PRAGMA table_info(configs)').all() as Array<{ name: string }>).map((r) => r.name)
  expect(tasksCols).toContain('task_spec_json')
  expect(tasksCols).toContain('attempt')
  expect(tasksCols).toContain('max_attempts')
  expect(configsCols).toContain('task_spec_json')

  db.prepare('insert into tasks(run_id, script, scenario, status) values(?,?,?,?)').run(
    'r1',
    's.py',
    'normal',
    'running'
  )
  const row = db.prepare('select run_id, status from tasks where run_id=?').get('r1') as any
  expect(row.run_id).toBe('r1')
  expect(row.status).toBe('running')
})
