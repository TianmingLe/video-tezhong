import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { PythonEnvManager } from './PythonEnvManager'

describe('PythonEnvManager', () => {
  test('ensureMediacrawlerEnv: marker 缺失时会创建 venv 并安装 requirements', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-pyenv-'))
    const mediaRoot = path.join(root, 'MediaCrawler')
    fs.mkdirSync(mediaRoot, { recursive: true })
    fs.writeFileSync(path.join(mediaRoot, 'requirements.txt'), 'requests==2.0.0\n', 'utf-8')

    const calls: Array<{ bin: string; args: string[]; env?: Record<string, string> }> = []
    const execFile = vi.fn(async (bin: string, args: string[], opts?: { env?: Record<string, string> }) => {
      calls.push({ bin, args, env: opts?.env })
    })

    const mgr = new PythonEnvManager({
      userDataPath: root,
      mediaCrawlerRoot: mediaRoot,
      systemPythonBin: 'python3',
      execFile
    })

    const res = await mgr.ensureMediacrawlerEnv()
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('expected ok')

    const venvPath = path.join(root, 'python', 'mediacrawler-venv')
    const venvPython = path.join(venvPath, 'bin', 'python')

    expect(res.pythonBin).toBe(venvPython)
    expect(calls[0]).toMatchObject({ bin: 'python3', args: ['-m', 'venv', venvPath] })
    expect(calls[1]).toMatchObject({ bin: venvPython, args: ['-m', 'pip', 'install', '-U', 'pip'] })
    expect(calls[2]).toMatchObject({ bin: venvPython, args: ['-m', 'pip', 'install', '-r', path.join(mediaRoot, 'requirements.txt')] })

    const marker = fs.readFileSync(path.join(venvPath, '.omni-installed.json'), 'utf-8')
    expect(marker).toMatch(/requirementsHash/)
    expect(marker).toMatch(/pythonVersion/)
  })
})

