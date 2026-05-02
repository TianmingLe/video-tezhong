import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { resolveMediaCrawlerRoot, resolveMediaCrawlerRunnerScript, writeTaskJson } from './mediacrawlerRunner'

describe('mediacrawlerRunner', () => {
  test('writeTaskJson writes file under userData/runs/<runId>', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-ud-'))
    const fp = writeTaskJson({
      userDataPath,
      spec: { kind: 'dy_mvp', runId: 'r1', args: { platform: 'dy', lt: 'qrcode', pipeline: 'mvp', specified_id: '1' } }
    })
    expect(fp).toContain(path.join('runs', 'r1', 'task.json'))
    expect(fs.existsSync(fp)).toBe(true)
  })

  test('resolve paths (dev)', () => {
    const root = resolveMediaCrawlerRoot({ cwd: '/workspace/desktop', isPackaged: false })
    expect(root).toContain('/workspace/MediaCrawler')
    const runner = resolveMediaCrawlerRunnerScript({ cwd: '/workspace/desktop', isPackaged: false })
    expect(runner).toContain('/workspace/desktop/resources/python/run_mediacrawler.py')
  })
})

