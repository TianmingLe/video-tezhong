import { afterEach, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDbForTest, initDb } from './index'

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

test('initDb creates tables and supports insert/select', () => {
  tmpFile = path.join(os.tmpdir(), `omni-${Date.now()}-${Math.random()}.db`)
  const db = createDbForTest(tmpFile)
  dbToClose = db
  initDb(db)

  const taskCols = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((r) => r.name)
  expect(taskCols).toContain('task_spec_json')
  expect(taskCols).toContain('attempt')
  expect(taskCols).toContain('max_attempts')

  const cfgCols = (db.prepare('PRAGMA table_info(configs)').all() as Array<{ name: string }>).map((r) => r.name)
  expect(cfgCols).toContain('task_spec_json')

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
