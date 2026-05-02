import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { MAX_ARCHIVED_LOG_CHUNK_SIZE, readArchivedLog } from './readArchivedLog'

describe('readArchivedLog', () => {
  test('正常读取：offset=0 返回 text，nextOffset 增加', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-arch-log-'))
    const logsDir = path.join(userDataPath, 'logs')
    await fs.mkdir(logsDir, { recursive: true })
    await fs.writeFile(path.join(logsDir, 'r1.log'), 'hello world', 'utf-8')

    const r1 = readArchivedLog({ userDataPath, runId: 'r1', offset: 0, chunkSize: 5 })
    expect(r1.success).toBe(true)
    if (!r1.success) throw new Error(r1.error)
    expect(r1.text).toBe('hello')
    expect(r1.offset).toBe(0)
    expect(r1.nextOffset).toBe(5)
    expect(r1.eof).toBe(false)

    const r2 = readArchivedLog({ userDataPath, runId: 'r1', offset: r1.nextOffset, chunkSize: 100 })
    expect(r2.success).toBe(true)
    if (!r2.success) throw new Error(r2.error)
    expect(r2.text).toBe(' world')
    expect(r2.eof).toBe(true)
  })

  test('EOF：offset>=size 返回 eof=true', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-arch-log-'))
    const logsDir = path.join(userDataPath, 'logs')
    await fs.mkdir(logsDir, { recursive: true })
    await fs.writeFile(path.join(logsDir, 'r2.log'), 'abc', 'utf-8')

    const r = readArchivedLog({ userDataPath, runId: 'r2', offset: 999, chunkSize: 10 })
    expect(r).toEqual({ success: true, offset: 999, nextOffset: 999, eof: true, text: '' })
  })

  test('runId traversal：返回 success=false', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-arch-log-'))
    const r = readArchivedLog({ userDataPath, runId: '../evil', offset: 0, chunkSize: 10 })
    expect(r.success).toBe(false)
  })

  test('chunkSize 上限裁剪：最多读取 256KB', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-arch-log-'))
    const logsDir = path.join(userDataPath, 'logs')
    await fs.mkdir(logsDir, { recursive: true })
    const content = 'a'.repeat(MAX_ARCHIVED_LOG_CHUNK_SIZE + 100)
    await fs.writeFile(path.join(logsDir, 'r3.log'), content, 'utf-8')

    const r = readArchivedLog({ userDataPath, runId: 'r3', offset: 0, chunkSize: 10 * 1024 * 1024 })
    expect(r.success).toBe(true)
    if (!r.success) throw new Error(r.error)
    expect(r.text.length).toBe(MAX_ARCHIVED_LOG_CHUNK_SIZE)
    expect(r.nextOffset).toBe(MAX_ARCHIVED_LOG_CHUNK_SIZE)
    expect(r.eof).toBe(false)
  })
})

