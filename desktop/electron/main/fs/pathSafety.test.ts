import { describe, expect, test } from 'vitest'
import path from 'node:path'
import { assertPathInside } from './pathSafety'

describe('pathSafety', () => {
  test('allows path inside dir', () => {
    const base = path.join('/a', 'b')
    const p = assertPathInside(base, path.join(base, 'x.txt'))
    expect(p).toContain(path.join('b', 'x.txt'))
  })

  test('rejects path escaping dir', () => {
    const base = path.join('/a', 'b')
    expect(() => assertPathInside(base, path.join(base, '..', 'x.txt'))).toThrow(/invalid/i)
  })

  test('win32: allows different-case drive path after normalization', () => {
    const base = 'C:\\A\\B'
    const p = assertPathInside(base, 'c:\\a\\b\\x.txt')
    expect(p.toLowerCase()).toContain('c:\\a\\b\\x.txt')
  })
})

