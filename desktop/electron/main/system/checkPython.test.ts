import { describe, expect, test, vi } from 'vitest'
import { checkPython } from './checkPython'

type ExecCb = (error: any, stdout: string, stderr: string) => void
type Exec = (command: string, cb: ExecCb) => void

describe('checkPython', () => {
  test('win32: tries python then python3', async () => {
    const calls: string[] = []
    const exec: Exec = (cmd, cb) => {
      calls.push(cmd)
      if (cmd.startsWith('python --version')) {
        const err: any = new Error('not found')
        err.code = 'ENOENT'
        cb(err, '', '')
        return
      }
      cb(null, '', 'Python 3.12.1')
    }

    const res = await checkPython({ platform: 'win32', exec })
    expect(calls).toEqual(['python --version', 'python3 --version'])
    expect(res.ok).toBe(true)
    expect(res.version).toBe('3.12.1')
    if (res.ok) expect(res.bin).toBe('python3')
  })

  test('linux: tries python3 then python', async () => {
    const calls: string[] = []
    const exec: Exec = (cmd, cb) => {
      calls.push(cmd)
      if (cmd.startsWith('python3 --version')) {
        const err: any = new Error('not found')
        err.code = 'ENOENT'
        cb(err, '', '')
        return
      }
      cb(null, 'Python 3.11.9\n', '')
    }

    const res = await checkPython({ platform: 'linux', exec })
    expect(calls).toEqual(['python3 --version', 'python --version'])
    expect(res.ok).toBe(true)
    expect(res.version).toBe('3.11.9')
    if (res.ok) expect(res.bin).toBe('python')
  })

  test('parses version from stderr', async () => {
    const exec: Exec = (_cmd, cb) => {
      cb(null, '', 'Python 3.10.0')
    }
    const res = await checkPython({ platform: 'darwin', exec })
    expect(res).toEqual({ ok: true, version: '3.10.0', bin: 'python3' })
  })

  test('permission error returns user-friendly suggestion', async () => {
    const exec: Exec = (_cmd, cb) => {
      const err: any = new Error('EACCES: permission denied')
      err.code = 'EACCES'
      cb(err, '', '')
    }
    const res = await checkPython({ platform: 'linux', exec })
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.suggestion).toMatch(/权限|permission/i)
  })

  test('not installed returns install suggestion', async () => {
    const exec: Exec = (_cmd, cb) => {
      const err: any = new Error('not found')
      err.code = 'ENOENT'
      cb(err, '', '')
    }
    const res = await checkPython({ platform: 'darwin', exec })
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.suggestion).toMatch(/安装|PATH|Python/i)
  })
})
