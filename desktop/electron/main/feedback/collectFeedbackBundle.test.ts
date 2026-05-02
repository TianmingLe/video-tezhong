import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { createFeedbackCollector } from './collectFeedbackBundle'
import type { TaskRecord } from '../db/types'
import type { TasksRepo } from '../db/tasksRepo'

function createMockTasksRepo(row: TaskRecord | null): TasksRepo {
  return {
    getAll: () => (row ? [row] : []),
    getById: () => null,
    insert: () => {
      throw new Error('not implemented')
    },
    updateStatus: () => {
      throw new Error('not implemented')
    }
  }
}

describe('collectFeedbackBundle', () => {
  test('收集系统信息 + 最近 2 个 crash json，并截断 stack', async () => {
    const userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'omni-feedback-'))
    const crashDir = path.join(userDataPath, 'crash')
    await fsp.mkdir(crashDir, { recursive: true })

    const writeCrash = async (name: string, data: unknown, mtimeMs: number) => {
      const fp = path.join(crashDir, name)
      await fsp.writeFile(fp, JSON.stringify(data), 'utf-8')
      const t = new Date(mtimeMs)
      fs.utimesSync(fp, t, t)
    }

    const longStack = 'x'.repeat(2100)
    await writeCrash('old.json', { stack: 'old' }, 10)
    await writeCrash('mid.json', { error: { stack: longStack } }, 20)
    await writeCrash('new.json', { stack: longStack }, 30)

    const tasksRepo = createMockTasksRepo({
      id: 1,
      run_id: 'r1',
      script: 'mock_device.py',
      scenario: 'normal',
      status: 'exited',
      exit_code: 2,
      start_time: null,
      end_time: null,
      duration: null,
      task_spec_json: null,
      attempt: null,
      max_attempts: null
    })

    const collector = createFeedbackCollector({
      userDataPath,
      tasksRepo,
      appVersion: '0.0.1',
      platform: 'linux',
      arch: 'x64',
      nodeVersion: '22.0.0',
      electronVersion: '31.0.0',
      fs,
      path
    })

    const { markdown } = collector.collectBundle({ userDescription: 'hello' })
    expect(markdown).toContain('## User Input')
    expect(markdown).toContain('hello')
    expect(markdown).toContain('| platform | linux |')
    expect(markdown).toContain('| appVersion | 0.0.1 |')

    expect(markdown).toContain('<summary>new.json')
    expect(markdown).toContain('<summary>mid.json')
    expect(markdown).not.toContain('<summary>old.json')
    expect(markdown).toContain('(truncated)')

    expect(markdown).toContain('| runId | r1 |')
    expect(markdown).toContain('| exitCode | 2 |')
  })

  test('crash 目录缺失时返回无，并不抛错', async () => {
    const userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'omni-feedback-'))
    const tasksRepo = createMockTasksRepo(null)
    const collector = createFeedbackCollector({
      userDataPath,
      tasksRepo,
      appVersion: '0.0.1',
      fs,
      path
    })

    const { markdown } = collector.collectBundle()
    expect(markdown).toContain('## Crash Reports')
    expect(markdown).toContain('\n无\n')
  })

  test('crash json 解析失败时仍生成 details，并包含错误信息', async () => {
    const userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'omni-feedback-'))
    const crashDir = path.join(userDataPath, 'crash')
    await fsp.mkdir(crashDir, { recursive: true })
    await fsp.writeFile(path.join(crashDir, 'bad.json'), '{not-json', 'utf-8')

    const tasksRepo = createMockTasksRepo(null)
    const collector = createFeedbackCollector({
      userDataPath,
      tasksRepo,
      appVersion: '0.0.1',
      fs,
      path
    })

    const { markdown } = collector.collectBundle()
    expect(markdown).toContain('<summary>bad.json')
    expect(markdown).toContain('解析失败：')
  })
})
