import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { PythonEnvManager } from './PythonEnvManager'

function createTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

describe('PythonEnvManager', () => {
  test('ensureMediacrawlerEnv creates venv and installs requirements, then reuses marker', async () => {
    const userDataPath = createTempDir('omni-ud-')
    const mediacrawlerRoot = createTempDir('omni-mc-')
    fs.writeFileSync(path.join(mediacrawlerRoot, 'requirements.txt'), 'requests==2.0.0\n', 'utf-8')

    const calls: Array<{ file: string; args: string[] }> = []
    const execFile = (file: string, args: string[], _opts: any, cb: any) => {
      calls.push({ file, args })
      if (args[0] === '-m' && args[1] === 'venv') {
        const venvPath = String(args[2])
        const pythonBin =
          process.platform === 'win32'
            ? path.join(venvPath, 'Scripts', 'python.exe')
            : path.join(venvPath, 'bin', 'python')
        fs.mkdirSync(path.dirname(pythonBin), { recursive: true })
        fs.writeFileSync(pythonBin, 'x', 'utf-8')
      }
      cb(null, '', '')
    }

    const mgr = new PythonEnvManager({
      userDataPath,
      platform: process.platform,
      mediacrawlerRoot,
      log: () => {},
      execFile: execFile as any,
      checkPython: async () => ({ ok: true, version: '3.11.9', bin: process.platform === 'win32' ? 'python' : 'python3' })
    })

    const r1 = await mgr.ensureMediacrawlerEnv()
    expect(r1.ok).toBe(true)
    expect(calls.some((c) => c.args.join(' ').includes('-m venv'))).toBe(true)
    expect(calls.some((c) => c.args.join(' ').includes('-m pip install -U pip'))).toBe(true)
    expect(calls.some((c) => c.args.join(' ').includes('-m pip install -r'))).toBe(true)

    calls.length = 0
    const r2 = await mgr.ensureMediacrawlerEnv()
    expect(r2.ok).toBe(true)
    expect(calls.length).toBe(0)
  })

  test('ensureMediacrawlerEnv rejects unsupported python version', async () => {
    const userDataPath = createTempDir('omni-ud-')
    const mediacrawlerRoot = createTempDir('omni-mc-')
    fs.writeFileSync(path.join(mediacrawlerRoot, 'requirements.txt'), 'requests==2.0.0\n', 'utf-8')

    const mgr = new PythonEnvManager({
      userDataPath,
      platform: process.platform,
      mediacrawlerRoot,
      log: () => {},
      execFile: (() => {}) as any,
      checkPython: async () => ({ ok: true, version: '3.10.1', bin: process.platform === 'win32' ? 'python' : 'python3' })
    })

    const r = await mgr.ensureMediacrawlerEnv()
    expect(r.ok).toBe(false)
  })
})
