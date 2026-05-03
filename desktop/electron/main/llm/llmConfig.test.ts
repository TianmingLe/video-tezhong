import { describe, expect, test } from 'vitest'
import { loadLlmConfig, saveLlmConfig, type LlmConfigFs, type SafeStorageLike } from './llmConfig'

function createMemFs(): LlmConfigFs & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    existsSync: (p) => files.has(p),
    readFileSync: (p, _enc) => {
      const v = files.get(p)
      if (v == null) throw new Error('ENOENT')
      return v
    },
    writeFileSync: (p, data, _enc) => {
      files.set(p, data)
    },
    mkdirSync: (_p, _opts) => {}
  }
}

function createSafeStorage(enabled: boolean): SafeStorageLike {
  return {
    isEncryptionAvailable: () => enabled,
    encryptString: (s) => Buffer.from(`enc:${s}`, 'utf-8'),
    decryptString: (b) => b.toString('utf-8').replace(/^enc:/, '')
  }
}

describe('llmConfig', () => {
  test('save+load: safeStorage enabled uses ciphertext', () => {
    const fs = createMemFs()
    const ss = createSafeStorage(true)
    saveLlmConfig({
      userDataPath: '/ud',
      fs,
      safeStorage: ss,
      config: { apiBaseUrl: 'u', model: 'm', apiKey: 'k', allowPlaintextFallback: true }
    })
    const got = loadLlmConfig({ userDataPath: '/ud', fs, safeStorage: ss })
    expect(got.apiBaseUrl).toBe('u')
    expect(got.model).toBe('m')
    expect(got.apiKey).toBe('k')
    expect(got.keyStorage).toBe('safeStorage')
  })

  test('save+load: safeStorage disabled fallback to plaintext when allowed', () => {
    const fs = createMemFs()
    const ss = createSafeStorage(false)
    saveLlmConfig({
      userDataPath: '/ud',
      fs,
      safeStorage: ss,
      config: { apiBaseUrl: 'u', model: 'm', apiKey: 'k', allowPlaintextFallback: true }
    })
    const got = loadLlmConfig({ userDataPath: '/ud', fs, safeStorage: ss })
    expect(got.apiKey).toBe('k')
    expect(got.keyStorage).toBe('plain')
  })
})

