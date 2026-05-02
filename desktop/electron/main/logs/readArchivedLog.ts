import fs from 'node:fs'
import path from 'node:path'

export const MAX_ARCHIVED_LOG_CHUNK_SIZE = 262144

export type GetArchivedLogArgs = {
  userDataPath: string
  runId: string
  offset: number
  chunkSize: number
}

export type GetArchivedLogResult =
  | { success: true; offset: number; nextOffset: number; eof: boolean; text: string }
  | { success: false; error: string }

function sanitizeRunId(runId: string): string {
  const id = String(runId || '').trim()
  if (!id) throw new Error('runId is required')
  if (id.includes('..') || id.includes('/') || id.includes('\\')) throw new Error('invalid runId')
  return id
}

function coerceOffset(offset: number): number {
  const n = Number(offset)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

function coerceChunkSize(chunkSize: number): number {
  const n = Number(chunkSize)
  const v = Number.isFinite(n) ? Math.floor(n) : MAX_ARCHIVED_LOG_CHUNK_SIZE
  const atLeast1 = v <= 0 ? 1 : v
  return Math.min(atLeast1, MAX_ARCHIVED_LOG_CHUNK_SIZE)
}

function getLogFilePath(userDataPath: string, runId: string): string {
  const base = path.resolve(path.join(path.resolve(String(userDataPath || '')), 'logs'))
  const id = sanitizeRunId(runId)
  const full = path.resolve(base, `${id}.log`)
  if (!full.startsWith(base + path.sep)) throw new Error('invalid runId')
  return full
}

export function readArchivedLog(args: GetArchivedLogArgs): GetArchivedLogResult {
  try {
    const fp = getLogFilePath(args.userDataPath, args.runId)
    const offset = coerceOffset(args.offset)
    const chunkSize = coerceChunkSize(args.chunkSize)

    let stat: fs.Stats
    try {
      stat = fs.statSync(fp)
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err?.code === 'ENOENT') return { success: true, offset, nextOffset: offset, eof: true, text: '' }
      throw e
    }

    const size = stat.size
    if (offset >= size) return { success: true, offset, nextOffset: offset, eof: true, text: '' }

    const toRead = Math.min(chunkSize, size - offset)
    const buf = Buffer.allocUnsafe(toRead)
    const fd = fs.openSync(fp, 'r')
    try {
      const bytesRead = fs.readSync(fd, buf, 0, toRead, offset)
      const text = buf.subarray(0, bytesRead).toString('utf-8')
      const nextOffset = offset + bytesRead
      return { success: true, offset, nextOffset, eof: nextOffset >= size, text }
    } finally {
      fs.closeSync(fd)
    }
  } catch (e) {
    return { success: false, error: String((e as Error)?.message || e) }
  }
}

