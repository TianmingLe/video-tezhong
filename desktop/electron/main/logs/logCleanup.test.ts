import { describe, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLogCleanup } from './logCleanup'

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omni-logCleanup-'))
}

function writeFileWithMtime(filePath: string, content: string, mtimeMs: number) {
  fs.writeFileSync(filePath, content, 'utf-8')
  const t = new Date(mtimeMs)
  fs.utimesSync(filePath, t, t)
}

describe('logCleanup', () => {
  test('preview: logs 目录不存在时返回 0', async () => {
    const userDataPath = mkTmpDir()
    const logCleanup = createLogCleanup({ userDataPath, fs, path })
    expect(await logCleanup.preview({ keep: 50 })).toEqual({ toDelete: 0, total: 0 })
  })

  test('preview: 只统计 .log，并按 mtime 倒序保留 keep 个', async () => {
    const userDataPath = mkTmpDir()
    const logsDir = path.join(userDataPath, 'logs')
    fs.mkdirSync(logsDir, { recursive: true })

    writeFileWithMtime(path.join(logsDir, 'a.log'), 'a', 1000)
    writeFileWithMtime(path.join(logsDir, 'b.log'), 'b', 2000)
    writeFileWithMtime(path.join(logsDir, 'c.txt'), 'c', 3000)
    writeFileWithMtime(path.join(logsDir, 'd.log'), 'd', 1500)

    const logCleanup = createLogCleanup({ userDataPath, fs, path })
    expect(await logCleanup.preview({ keep: 2 })).toEqual({ toDelete: 1, total: 3 })
  })

  test('cleanup: 删除超出 keep 的旧 .log 文件', async () => {
    const userDataPath = mkTmpDir()
    const logsDir = path.join(userDataPath, 'logs')
    fs.mkdirSync(logsDir, { recursive: true })

    writeFileWithMtime(path.join(logsDir, '1.log'), '1', 1000)
    writeFileWithMtime(path.join(logsDir, '2.log'), '2', 2000)
    writeFileWithMtime(path.join(logsDir, '3.log'), '3', 3000)
    writeFileWithMtime(path.join(logsDir, '4.log'), '4', 4000)

    const logCleanup = createLogCleanup({ userDataPath, fs, path })
    const preview = await logCleanup.preview({ keep: 2 })
    expect(preview).toEqual({ toDelete: 2, total: 4 })

    const res = await logCleanup.cleanup({ keep: 2 })
    expect(res).toEqual({ success: true, deleted: 2 })

    expect(fs.existsSync(path.join(logsDir, '4.log'))).toBe(true)
    expect(fs.existsSync(path.join(logsDir, '3.log'))).toBe(true)
    expect(fs.existsSync(path.join(logsDir, '2.log'))).toBe(false)
    expect(fs.existsSync(path.join(logsDir, '1.log'))).toBe(false)
  })
})

