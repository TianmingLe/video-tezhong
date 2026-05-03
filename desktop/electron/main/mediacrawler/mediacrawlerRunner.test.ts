import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { writeTaskJson } from './mediacrawlerRunner'

describe('mediacrawlerRunner', () => {
  test('writeTaskJson: 写入 runs/<runId>/task.json 并包含 mediaCrawlerRoot/runDir', () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-mc-'))
    const mediaCrawlerRoot = path.join(userDataPath, 'MediaCrawler')
    fs.mkdirSync(mediaCrawlerRoot, { recursive: true })

    const { runDir, taskJsonPath } = writeTaskJson({
      userDataPath,
      mediaCrawlerRoot,
      spec: { kind: 'dy_mvp', runId: 'r1', args: { specifiedId: '1' } }
    })

    expect(runDir).toBe(path.join(userDataPath, 'results', 'runs', 'r1'))
    expect(taskJsonPath).toBe(path.join(runDir, 'task.json'))

    const raw = fs.readFileSync(taskJsonPath, 'utf-8')
    const obj = JSON.parse(raw) as any
    expect(obj.runId).toBe('r1')
    expect(obj.mediaCrawlerRoot).toBe(mediaCrawlerRoot)
    expect(obj.runDir).toBe(runDir)
  })
})

