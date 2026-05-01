import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

export type SqliteDb = Database.Database

let dbSingleton: SqliteDb | null = null

function getSchemaSql(): string {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url))
  return fs.readFileSync(schemaPath, 'utf-8')
}

export function initDb(db: SqliteDb): void {
  db.exec(getSchemaSql())
}

export function createDbForTest(filePath: string): SqliteDb {
  return new Database(filePath)
}

function getDbFilePath(): string {
  const base =
    String(process.env.OMNI_USER_DATA_PATH || '').trim() ||
    String(process.env.ELECTRON_USER_DATA_PATH || '').trim() ||
    process.cwd()
  return path.join(base, 'omniscraper.db')
}

export function getDb(): SqliteDb {
  if (dbSingleton) return dbSingleton

  const filePath = getDbFilePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new Database(filePath)
  initDb(db)
  dbSingleton = db
  return db
}
