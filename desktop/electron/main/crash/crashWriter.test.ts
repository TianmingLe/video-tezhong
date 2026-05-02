import { describe, expect, test } from 'vitest'
import path from 'node:path'
import { createCrashWriter } from './crashWriter'
import { registerMainCrashHandlers } from './registerMainCrashHandlers'

function createMemFs(): {
  files: Map<string, string>
  mkdirSync: (p: string, _opts: { recursive: boolean }) => void
  writeFileSync: (p: string, data: string, _enc: BufferEncoding) => void
} {
  const files = new Map<string, string>()
  return {
    files,
    mkdirSync: () => {},
    writeFileSync: (p, data) => {
      files.set(p, data)
    }
  }
}

function formatFileTs(ts: number): string {
  return new Date(ts).toISOString().replace(/[:.]/g, '-')
}

describe('crashWriter', () => {
  test('write: 会在 <userData>/crash 下写入 JSON', () => {
    const fs = createMemFs()
    const userDataPath = '/tmp/userData'
    const ts = 1700000000123
    const writer = createCrashWriter({ userDataPath, fs, now: () => ts, idFactory: () => 'id1' })

    const r = writer.write({
      schemaVersion: 1,
      ts,
      processType: 'main',
      eventType: 'uncaughtException',
      error: { name: 'Error', message: 'boom', stack: 'stack' },
      context: { lastRunId: null },
      system: { platform: 'linux', arch: 'x64', node: '22.0.0', electron: '31.0.0', chrome: '120.0.0' }
    })

    expect(r.success).toBe(true)
    if (!r.success) return

    const expectedPath = path.join(userDataPath, 'crash', `${formatFileTs(ts)}-main-id1.json`)
    expect(r.filePath).toBe(expectedPath)

    const body = fs.files.get(expectedPath)
    expect(body).toBeTruthy()
    const parsed = JSON.parse(String(body).trim())
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.processType).toBe('main')
    expect(parsed.context).toEqual({ lastRunId: null })
    expect(parsed).not.toHaveProperty('env')
    expect(parsed).not.toHaveProperty('processEnv')
  })

  test('registerMainCrashHandlers: 会捕获 uncaughtException 并写入 lastRunId', () => {
    const fs = createMemFs()
    const userDataPath = '/tmp/userData2'
    let id = 0
    const writer = createCrashWriter({ userDataPath, fs, idFactory: () => `id${++id}` })

    const listeners = {
      uncaughtException: new Set<(err: unknown) => void>(),
      unhandledRejection: new Set<(reason: unknown) => void>()
    }

    const proc = {
      platform: 'linux' as const,
      arch: 'x64',
      versions: { node: '22.0.0', electron: '31.0.0', chrome: '120.0.0' } as any,
      on: (event: 'uncaughtException' | 'unhandledRejection', cb: any) => {
        ;(listeners as any)[event].add(cb)
      },
      removeListener: (event: 'uncaughtException' | 'unhandledRejection', cb: any) => {
        ;(listeners as any)[event].delete(cb)
      }
    }

    const ts = 1700000001000
    const dispose = registerMainCrashHandlers({
      crashWriter: writer,
      proc: proc as any,
      now: () => ts,
      getLastRunId: () => 'r42'
    })

    for (const cb of listeners.uncaughtException) cb(new Error('boom'))
    dispose()

    const filePath = path.join(userDataPath, 'crash', `${formatFileTs(ts)}-main-id1.json`)
    const parsed = JSON.parse(String(fs.files.get(filePath) ?? '').trim())
    expect(parsed.eventType).toBe('uncaughtException')
    expect(parsed.context.lastRunId).toBe('r42')
  })
})

