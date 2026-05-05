import { describe, it, expect } from 'vitest'
import { classifyError, classifyErrorWithContext, type ErrorCategory } from './ErrorClassifier'

describe('classifyError', () => {
  it('maps ENOENT to FILE_SYSTEM', () => {
    const res = classifyError({ code: 'ENOENT', message: 'file not found' })
    expect(res.category).toBe('FILE_SYSTEM')
    expect(res.code).toBe('ENOENT')
    expect(res.userMessage).toContain('文件系统')
  })

  it('maps EBUSY to FILE_SYSTEM', () => {
    const res = classifyError({ code: 'EBUSY', message: 'resource busy' })
    expect(res.category).toBe('FILE_SYSTEM')
    expect(res.code).toBe('EBUSY')
  })

  it('maps EPERM to PERMISSION', () => {
    const res = classifyError({ code: 'EPERM', message: 'operation not permitted' })
    expect(res.category).toBe('PERMISSION')
    expect(res.code).toBe('EPERM')
  })

  it('maps EACCES to PERMISSION', () => {
    const res = classifyError({ code: 'EACCES', message: 'access denied' })
    expect(res.category).toBe('PERMISSION')
    expect(res.code).toBe('EACCES')
  })

  it('maps SQLITE_BUSY to PERMISSION', () => {
    const res = classifyError({ code: 'SQLITE_BUSY', message: 'database is locked' })
    expect(res.category).toBe('PERMISSION')
    expect(res.code).toBe('SQLITE_BUSY')
  })

  it('maps ECONNREFUSED to NETWORK', () => {
    const res = classifyError({ code: 'ECONNREFUSED', message: 'connection refused' })
    expect(res.category).toBe('NETWORK')
    expect(res.code).toBe('ECONNREFUSED')
  })

  it('maps ETIMEDOUT to NETWORK', () => {
    const res = classifyError({ code: 'ETIMEDOUT', message: 'timed out' })
    expect(res.category).toBe('NETWORK')
    expect(res.code).toBe('ETIMEDOUT')
  })

  it('maps python spawn ENOENT to PYTHON', () => {
    const res = classifyError({ code: 'ENOENT', message: 'spawn python ENOENT' })
    expect(res.category).toBe('PYTHON')
    expect(res.code).toBe('PYTHON_NOT_FOUND')
  })

  it('maps generic python error to PYTHON', () => {
    const res = classifyError(new Error('python pip install failed'))
    expect(res.category).toBe('PYTHON')
    expect(res.code).toBe('PYTHON_ERROR')
  })

  it('maps zod validation error to VALIDATION', () => {
    const res = classifyError(new Error('zod validation failed: invalid type'))
    expect(res.category).toBe('VALIDATION')
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('maps required field error to VALIDATION', () => {
    const res = classifyError(new Error('field is required'))
    expect(res.category).toBe('VALIDATION')
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('falls back to UNKNOWN for unrecognized errors', () => {
    const res = classifyError(new Error('something weird happened'))
    expect(res.category).toBe('UNKNOWN')
    expect(res.code).toBe('UNKNOWN')
    expect(res.userMessage).toContain('未知')
  })

  it('falls back to UNKNOWN for plain strings', () => {
    const res = classifyError('random failure')
    expect(res.category).toBe('UNKNOWN')
    expect(res.devDetail).toBe('random failure')
  })

  it('preserves custom code when falling back to UNKNOWN', () => {
    const res = classifyError({ code: 'CUSTOM_CODE', message: 'weird' })
    expect(res.category).toBe('UNKNOWN')
    expect(res.code).toBe('CUSTOM_CODE')
  })

  it('maps network keyword without code to NETWORK', () => {
    const res = classifyError(new Error('network unreachable'))
    expect(res.category).toBe('NETWORK')
    expect(res.code).toBe('NETWORK_ERROR')
  })

  it('maps timeout keyword without code to NETWORK', () => {
    const res = classifyError(new Error('request timeout'))
    expect(res.category).toBe('NETWORK')
    expect(res.code).toBe('NETWORK_ERROR')
  })

  it('maps permission denied keyword without code to PERMISSION', () => {
    const res = classifyError(new Error('permission denied on /data'))
    expect(res.category).toBe('PERMISSION')
    expect(res.code).toBe('PERMISSION_DENIED')
  })

  it('maps ebusy keyword without code to FILE_SYSTEM', () => {
    const res = classifyError(new Error('file is ebusy'))
    expect(res.category).toBe('FILE_SYSTEM')
    expect(res.code).toBe('FILE_SYSTEM_ERROR')
  })

  it('maps not a file to FILE_SYSTEM', () => {
    const res = classifyError(new Error('not a file'))
    expect(res.category).toBe('FILE_SYSTEM')
    expect(res.code).toBe('FILE_SYSTEM_ERROR')
  })
})

describe('classifyErrorWithContext', () => {
  it('includes operation and runId in devDetail', () => {
    const res = classifyErrorWithContext(new Error('fail'), { operation: 'jobStart', runId: 'r1' })
    expect(res.devDetail).toBe('[operation=jobStart, runId=r1] fail')
    expect(res.category).toBe('UNKNOWN')
  })

  it('works without context', () => {
    const res = classifyErrorWithContext(new Error('fail'))
    expect(res.devDetail).toBe('fail')
  })
})
