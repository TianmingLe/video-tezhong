import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createOnboardingStore } from './onboardingStore'

function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omni-onboarding-'))
}

describe('onboardingStore', () => {
  let dir: string | null = null

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  test('read: 文件不存在时返回 completed=false', () => {
    dir = createTmpDir()
    const store = createOnboardingStore({ userDataPath: dir, fs })
    expect(store.getState()).toEqual({ version: 1, completed: false })
  })

  test('read: 文件损坏/结构不合法时 fallback', () => {
    dir = createTmpDir()
    fs.writeFileSync(path.join(dir, 'onboarding.json'), '{ bad json', 'utf-8')
    const store = createOnboardingStore({ userDataPath: dir, fs })
    expect(store.getState()).toEqual({ version: 1, completed: false })
  })

  test('complete: 写入 completed=true', () => {
    dir = createTmpDir()
    const store = createOnboardingStore({ userDataPath: dir, fs })
    const next = store.complete()
    expect(next.completed).toBe(true)
    expect(store.getState()).toEqual({ version: 1, completed: true })
  })

  test('reset: 删除文件并回到 completed=false', () => {
    dir = createTmpDir()
    const store = createOnboardingStore({ userDataPath: dir, fs })
    store.complete()
    expect(store.getState().completed).toBe(true)

    const next = store.reset()
    expect(next).toEqual({ version: 1, completed: false })
    expect(store.getState()).toEqual({ version: 1, completed: false })
  })
})
