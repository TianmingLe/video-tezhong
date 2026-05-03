import { describe, expect, test } from 'vitest'
import { checkPython } from './checkPython'

type ExecFile = (bin: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

describe('checkPython', () => {
  test('win32: tries python then python3', async () => {
    const calls: Array<{ bin: string; args: string[] }> = []
    const execFile: ExecFile = async (bin, args) => {
      calls.push({ bin, args })
      if (bin === 'python') {
        const err: any = new Error('not found')
        err.code = 'ENOENT'
        throw err
      }
      return { stdout: '', stderr: 'Python 3.12.1' }
    }

    const res = await checkPython({ platform: 'win32', execFile })
    expect(calls).toEqual([
      { bin: 'python', args: ['--version'] },
      { bin: 'python3', args: ['--version'] }
    ])
    expect(res.ok).toBe(true)
    expect(res.version).toBe('3.12.1')
    if (res.ok) expect(res.bin).toBe('python3')
  })

  test('linux: tries python3 then python', async () => {
    const calls: Array<{ bin: string; args: string[] }> = []
    const execFile: ExecFile = async (bin, args) => {
      calls.push({ bin, args })
      if (bin === 'python3') {
        const err: any = new Error('not found')
        err.code = 'ENOENT'
        throw err
      }
      return { stdout: 'Python 3.11.9\n', stderr: '' }
    }

    const res = await checkPython({ platform: 'linux', execFile })
    expect(calls).toEqual([
      { bin: 'python3', args: ['--version'] },
      { bin: 'python', args: ['--version'] }
    ])
    expect(res.ok).toBe(true)
    expect(res.version).toBe('3.11.9')
    if (res.ok) expect(res.bin).toBe('python')
  })

  test('parses version from stderr', async () => {
    const execFile: ExecFile = async () => ({ stdout: '', stderr: 'Python 3.10.0' })
    const res = await checkPython({ platform: 'darwin', execFile })
    expect(res).toEqual({ ok: true, version: '3.10.0', bin: 'python3' })
  })

  test('permission error returns user-friendly suggestion', async () => {
    const execFile: ExecFile = async () => {
      const err: any = new Error('permission denied')
      err.code = 'EACCES'
      throw err
    }
    const res = await checkPython({ platform: 'linux', execFile })
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.suggestion).toMatch(/权限|permission/i)
  })

  test('not installed returns install suggestion', async () => {
    const execFile: ExecFile = async () => {
      const err: any = new Error('not found')
      err.code = 'ENOENT'
      throw err
    }
    const res = await checkPython({ platform: 'darwin', execFile })
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.suggestion).toMatch(/安装|PATH|Python/i)
  })
})
