import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { createLogArchive } from './logArchive'

describe('logArchive', () => {
  test('appendLog: 追加内容正确', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-log-'))
    const archive = createLogArchive({ userDataPath })

    archive.ensureDir()
    archive.appendLog('r1', 'a')
    archive.appendLog('r1', 'b')

    expect(archive.getLogContent('r1')).toBe('a\nb\n')
  })

  test('getLogContent: 文件不存在返回 null', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-log-'))
    const archive = createLogArchive({ userDataPath })
    expect(archive.getLogContent('missing')).toBe(null)
  })

  test('runId sanitize: 拒绝 ../', async () => {
    const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'omni-log-'))
    const archive = createLogArchive({ userDataPath })
    expect(() => archive.appendLog('../evil', 'x')).toThrow()
  })
})

