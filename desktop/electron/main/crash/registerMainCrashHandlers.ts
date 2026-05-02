import type { CrashReport, CrashWriter } from './crashWriter'

export interface ProcessLike {
  on(event: 'uncaughtException', listener: (err: unknown) => void): void
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void
  removeListener(event: 'uncaughtException', listener: (err: unknown) => void): void
  removeListener(event: 'unhandledRejection', listener: (reason: unknown) => void): void
  versions?: NodeJS.ProcessVersions
  platform: NodeJS.Platform
  arch: string
}

function toErrorShape(v: unknown): { name: string; message: string; stack?: string } {
  if (v instanceof Error) {
    return { name: v.name || 'Error', message: v.message || '', stack: v.stack }
  }
  const msg = typeof v === 'string' ? v : v == null ? '' : String(v)
  return { name: 'Error', message: msg }
}

function toReasonDetails(v: unknown): Record<string, unknown> {
  if (v instanceof Error) {
    return { reasonType: 'Error', reasonMessage: v.message || '', reasonStack: v.stack }
  }
  if (typeof v === 'string') return { reasonType: 'string', reason: v }
  if (typeof v === 'number' || typeof v === 'boolean') return { reasonType: typeof v, reason: v }
  if (v == null) return { reasonType: String(v), reason: null }
  return { reasonType: typeof v, reason: String(v) }
}

export function registerMainCrashHandlers(args: {
  crashWriter: CrashWriter
  getLastRunId?: () => string | null
  proc?: ProcessLike
  now?: () => number
}): () => void {
  const proc = args.proc ?? (process as unknown as ProcessLike)
  const now = args.now ?? (() => Date.now())
  const getLastRunId = args.getLastRunId ?? (() => null)

  const baseSystem: CrashReport['system'] = {
    platform: proc.platform,
    arch: proc.arch,
    electron: proc.versions?.electron,
    chrome: proc.versions?.chrome,
    node: proc.versions?.node ?? process.versions.node
  }

  const onUncaughtException = (err: unknown) => {
    try {
      const report: CrashReport = {
        schemaVersion: 1,
        ts: now(),
        processType: 'main',
        eventType: 'uncaughtException',
        error: toErrorShape(err),
        context: { lastRunId: getLastRunId() },
        system: baseSystem
      }
      args.crashWriter.write(report)
    } catch {}
  }

  const onUnhandledRejection = (reason: unknown) => {
    try {
      const report: CrashReport = {
        schemaVersion: 1,
        ts: now(),
        processType: 'main',
        eventType: 'unhandledRejection',
        error: reason instanceof Error ? toErrorShape(reason) : undefined,
        details: toReasonDetails(reason),
        context: { lastRunId: getLastRunId() },
        system: baseSystem
      }
      args.crashWriter.write(report)
    } catch {}
  }

  proc.on('uncaughtException', onUncaughtException)
  proc.on('unhandledRejection', onUnhandledRejection)

  return () => {
    try {
      proc.removeListener('uncaughtException', onUncaughtException)
    } catch {}
    try {
      proc.removeListener('unhandledRejection', onUnhandledRejection)
    } catch {}
  }
}

