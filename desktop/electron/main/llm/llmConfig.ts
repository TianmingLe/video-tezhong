import path from 'node:path'

export type LlmKeyStorage = 'safeStorage' | 'plain'

export type LlmConfigSnapshot = {
  apiBaseUrl: string
  model: string
  hasKey: boolean
  keyStorage: LlmKeyStorage | null
  encryptionAvailable: boolean
}

export type LlmConfigSecret = {
  apiKey: string | null
}

export type LlmConfigFile =
  | { apiBaseUrl: string; model: string; keyStorage: 'safeStorage'; apiKeyCiphertextBase64: string; updatedAt: number }
  | { apiBaseUrl: string; model: string; keyStorage: 'plain'; apiKeyPlain: string; updatedAt: number }

export type LlmConfigFs = {
  readFileSync: (filePath: string, encoding: 'utf-8') => string
  writeFileSync: (filePath: string, data: string, encoding: 'utf-8') => void
  existsSync: (filePath: string) => boolean
  mkdirSync: (dirPath: string, opts: { recursive: boolean }) => void
}

export type SafeStorageLike = {
  isEncryptionAvailable: () => boolean
  encryptString: (text: string) => Buffer
  decryptString: (buf: Buffer) => string
}

export function getLlmConfigFilePath(userDataPath: string): string {
  return path.join(userDataPath, 'llm-config.json')
}

export function loadLlmConfig(args: { userDataPath: string; fs: LlmConfigFs; safeStorage: SafeStorageLike }): LlmConfigSnapshot &
  LlmConfigSecret {
  const filePath = getLlmConfigFilePath(args.userDataPath)
  const encryptionAvailable = args.safeStorage.isEncryptionAvailable()
  if (!args.fs.existsSync(filePath)) return { apiBaseUrl: '', model: '', apiKey: null, hasKey: false, keyStorage: null, encryptionAvailable }

  try {
    const raw = args.fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<LlmConfigFile> | null
    const apiBaseUrl = String((parsed as any)?.apiBaseUrl ?? '')
    const model = String((parsed as any)?.model ?? '')
    const keyStorage = (parsed as any)?.keyStorage === 'safeStorage' || (parsed as any)?.keyStorage === 'plain' ? (parsed as any).keyStorage : null

    let apiKey: string | null = null
    if (keyStorage === 'safeStorage') {
      const b64 = String((parsed as any)?.apiKeyCiphertextBase64 ?? '')
      if (b64 && encryptionAvailable) apiKey = args.safeStorage.decryptString(Buffer.from(b64, 'base64'))
    } else if (keyStorage === 'plain') {
      const plain = String((parsed as any)?.apiKeyPlain ?? '')
      apiKey = plain || null
    }

    return { apiBaseUrl, model, apiKey, hasKey: Boolean(apiKey), keyStorage, encryptionAvailable }
  } catch {
    return { apiBaseUrl: '', model: '', apiKey: null, hasKey: false, keyStorage: null, encryptionAvailable }
  }
}

export function saveLlmConfig(args: {
  userDataPath: string
  fs: LlmConfigFs
  safeStorage: SafeStorageLike
  config: { apiBaseUrl: string; model: string; apiKey: string; allowPlaintextFallback: boolean }
  now?: () => number
}): LlmConfigSnapshot {
  const encryptionAvailable = args.safeStorage.isEncryptionAvailable()
  const apiBaseUrl = String(args.config.apiBaseUrl ?? '').trim()
  const model = String(args.config.model ?? '').trim()
  const apiKey = String(args.config.apiKey ?? '')
  const updatedAt = (args.now ?? (() => Date.now()))()

  args.fs.mkdirSync(args.userDataPath, { recursive: true })
  const filePath = getLlmConfigFilePath(args.userDataPath)

  let file: LlmConfigFile
  if (encryptionAvailable) {
    const buf = args.safeStorage.encryptString(apiKey)
    file = { apiBaseUrl, model, keyStorage: 'safeStorage', apiKeyCiphertextBase64: buf.toString('base64'), updatedAt }
  } else {
    if (!args.config.allowPlaintextFallback) {
      return { apiBaseUrl, model, hasKey: false, keyStorage: null, encryptionAvailable }
    }
    file = { apiBaseUrl, model, keyStorage: 'plain', apiKeyPlain: apiKey, updatedAt }
  }

  args.fs.writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8')
  return { apiBaseUrl, model, hasKey: Boolean(apiKey), keyStorage: file.keyStorage, encryptionAvailable }
}

