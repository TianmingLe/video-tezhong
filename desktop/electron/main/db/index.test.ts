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
