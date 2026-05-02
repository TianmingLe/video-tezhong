import path from 'node:path'

export type OnboardingState = {
  version: 1
  completed: boolean
  skippedAt?: number
}

export type OnboardingStoreFs = {
  readFileSync: (filePath: string, encoding: 'utf-8') => string
  writeFileSync: (filePath: string, data: string, encoding: 'utf-8') => void
  existsSync: (filePath: string) => boolean
  mkdirSync: (dirPath: string, opts: { recursive: boolean }) => void
  unlinkSync: (filePath: string) => void
}

const defaultState: OnboardingState = { version: 1, completed: false }

function getFilePath(userDataPath: string): string {
  return path.join(userDataPath, 'onboarding.json')
}

function normalizeState(input: unknown): OnboardingState {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : null
  if (!o) return defaultState
  if (o.version !== 1) return defaultState

  const completed = typeof o.completed === 'boolean' ? o.completed : defaultState.completed
  const skippedAt = typeof o.skippedAt === 'number' && Number.isFinite(o.skippedAt) ? o.skippedAt : undefined

  return skippedAt === undefined ? { version: 1, completed } : { version: 1, completed, skippedAt }
}

export function createOnboardingStore(args: { userDataPath: string; fs: OnboardingStoreFs }) {
  const filePath = getFilePath(args.userDataPath)

  const readState = (): OnboardingState => {
    if (!args.fs.existsSync(filePath)) return defaultState
    try {
      const raw = args.fs.readFileSync(filePath, 'utf-8')
      return normalizeState(JSON.parse(raw))
    } catch {
      return defaultState
    }
  }

  const writeState = (state: OnboardingState): void => {
    args.fs.mkdirSync(args.userDataPath, { recursive: true })
    args.fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8')
  }

  return {
    getState: () => readState(),
    complete: (opts?: { skipped?: boolean; now?: number }) => {
      const skipped = Boolean(opts?.skipped)
      const now = typeof opts?.now === 'number' && Number.isFinite(opts.now) ? opts.now : Date.now()
      const next: OnboardingState = skipped ? { version: 1, completed: true, skippedAt: now } : { version: 1, completed: true }
      writeState(next)
      return next
    },
    reset: () => {
      try {
        if (args.fs.existsSync(filePath)) args.fs.unlinkSync(filePath)
      } catch {}
      return defaultState
    }
  }
}

