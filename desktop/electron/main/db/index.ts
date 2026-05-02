import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

export type SqliteDb = Database.Database

let dbSingleton: SqliteDb | null = null

export const dbState = {
  isReadOnly: false
}

function getSchemaSql(): string {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))
  return fs.readFileSync(schemaPath, 'utf-8')
}

function ensureColumn(db: SqliteDb, table: string, col: string, sqlType: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (rows.some((r) => r.name === col)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${sqlType}`)
}

export function initDb(db: SqliteDb): void {
  db.exec(getSchemaSql())
  ensureColumn(db, 'tasks', 'task_spec_json', 'TEXT')
  ensureColumn(db, 'tasks', 'attempt', 'INTEGER')
  ensureColumn(db, 'tasks', 'max_attempts', 'INTEGER')
  ensureColumn(db, 'configs', 'task_spec_json', 'TEXT')
}

export function createDbForTest(filePath: string): SqliteDb {
  const db = new Database(filePath)
  configureDb(db)
  return db
}

function getDbFilePath(): string {
  const base =
    String(process.env.OMNI_USER_DATA_PATH || '').trim() ||
    String(process.env.ELECTRON_USER_DATA_PATH || '').trim() ||
    process.cwd()
  return path.join(base, 'omniscraper.db')
}

function configureDb(db: SqliteDb): void {
  try {
    db.pragma('busy_timeout = 3000')
  } catch {}
}

function isRetryableSqliteError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null
  const code = String(e?.code ?? '')
  if (code === 'SQLITE_BUSY') return true
  if (code === 'SQLITE_LOCKED') return true
  if (code === 'SQLITE_BUSY_SNAPSHOT') return true
  const msg = String(e?.message ?? '')
  if (/database is locked/i.test(msg)) return true
  if (/SQLITE_BUSY/i.test(msg)) return true
  if (/SQLITE_LOCKED/i.test(msg)) return true
  return false
}

type SleepFn = (ms: number) => void

export type RetryRunner = <T>(fn: () => T) => T

export function createRetryRunner(args?: { sleep?: SleepFn; delaysMs?: number[] }): RetryRunner {
  const delaysMs = (args?.delaysMs?.length ? args?.delaysMs : null) ?? [50, 100, 200]
  const sleepArray = new Int32Array(new SharedArrayBuffer(4))
  const sleep: SleepFn =
    args?.sleep ??
    ((ms) => {
      const waitMs = Number(ms)
      if (!Number.isFinite(waitMs)) return
      if (waitMs <= 0) return
      Atomics.wait(sleepArray, 0, 0, Math.floor(waitMs))
    })

  return <T>(fn: () => T): T => {
    const f = typeof fn === 'function' ? fn : null
    if (!f) throw new Error('fn is required')

    for (let i = 0; i <= delaysMs.length; i++) {
      try {
        return f()
      } catch (e) {
        const last = i >= delaysMs.length
        if (last || !isRetryableSqliteError(e)) throw e
        sleep(delaysMs[i]!)
      }
    }

    throw new Error('unreachable')
  }
}

export const runWithRetry = createRetryRunner()

export function openDbWithFallback(filePath: string): { db: SqliteDb; isReadOnly: boolean } {
  const fp = path.resolve(String(filePath || ''))
  if (!fp) throw new Error('filePath is required')

  try {
    const db = new Database(fp, { timeout: 3000 })
    return { db, isReadOnly: false }
  } catch (e) {
    const original = e
    try {
      const db = new Database(fp, { readonly: true, fileMustExist: true, timeout: 3000 })
      return { db, isReadOnly: true }
    } catch {
      throw original
    }
  }
}

export function getDb(): SqliteDb {
  if (dbSingleton) return dbSingleton

  const filePath = getDbFilePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const { db, isReadOnly } = openDbWithFallback(filePath)
  configureDb(db)
  dbState.isReadOnly = isReadOnly
  if (!isReadOnly) initDb(db)
  dbSingleton = db
  return db
}
