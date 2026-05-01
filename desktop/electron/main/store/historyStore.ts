import type { JobState } from '../job/JobQueue'

export type TaskHistoryItem = {
  runId: string
  scriptName: string
  scenario: string
  status: JobState
  exitCode: number | null
  startTime: number | null
  endTime: number | null
}

export type TaskHistoryUpsert = { runId: string } & Partial<Omit<TaskHistoryItem, 'runId'>>

export type StoreAdapter = {
  get: <T>(key: string) => T | undefined
  set: <T>(key: string, value: T) => void
}

export type HistoryStatusChange =
  | { runId: string; status: 'queued'; scriptName: string; scenario: string; ts?: number }
  | { runId: string; status: 'running'; ts?: number }
  | { runId: string; status: 'exited'; exitCode: number | null; ts?: number }
  | { runId: string; status: 'error'; ts?: number }
  | { runId: string; status: 'cancelled'; ts?: number }

export type HistoryStore = {
  upsert: (item: TaskHistoryUpsert) => TaskHistoryItem
  list: () => TaskHistoryItem[]
  get: (runId: string) => TaskHistoryItem | null
  applyStatusChange: (change: HistoryStatusChange) => TaskHistoryItem
}

const DEFAULT_KEY = 'taskHistory'

function normalizeItems(v: unknown): TaskHistoryItem[] {
  if (!Array.isArray(v)) return []
  const out: TaskHistoryItem[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const runId = typeof o.runId === 'string' ? o.runId : ''
    const scriptName = typeof o.scriptName === 'string' ? o.scriptName : ''
    const scenario = typeof o.scenario === 'string' ? o.scenario : ''
    const status = o.status
    const exitCode =
      typeof o.exitCode === 'number' ? o.exitCode : o.exitCode === null ? null : null
    const startTime =
      typeof o.startTime === 'number' ? o.startTime : o.startTime === null ? null : null
    const endTime =
      typeof o.endTime === 'number' ? o.endTime : o.endTime === null ? null : null
    if (!runId.trim()) continue
    if (status !== 'queued' && status !== 'running' && status !== 'exited' && status !== 'error' && status !== 'cancelled')
      continue
    out.push({ runId, scriptName, scenario, status, exitCode, startTime, endTime })
  }
  return out
}

function cloneItem(it: TaskHistoryItem): TaskHistoryItem {
  return { ...it }
}

function hasKey<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export function createHistoryStore(args: { adapter: StoreAdapter; key?: string; now?: () => number }): HistoryStore {
  const key = args.key ?? DEFAULT_KEY
  const now = args.now ?? (() => Date.now())

  const readAll = (): TaskHistoryItem[] => normalizeItems(args.adapter.get<unknown>(key))

  const writeAll = (items: TaskHistoryItem[]) => {
    args.adapter.set(key, items.map(cloneItem))
  }

  const get = (runId: string): TaskHistoryItem | null => {
    const id = String(runId || '').trim()
    if (!id) return null
    const items = readAll()
    const it = items.find((x) => x.runId === id)
    return it ? cloneItem(it) : null
  }

  const upsert = (item: TaskHistoryUpsert): TaskHistoryItem => {
    const runId = String(item.runId || '').trim()
    if (!runId) throw new Error('runId is required')

    const items = readAll()
    const idx = items.findIndex((x) => x.runId === runId)
    const base: TaskHistoryItem =
      idx >= 0
        ? items[idx]
        : {
            runId,
            scriptName: '',
            scenario: '',
            status: 'queued',
            exitCode: null,
            startTime: null,
            endTime: null
          }

    const next: TaskHistoryItem = {
      runId,
      scriptName: hasKey(item, 'scriptName') ? (item.scriptName ?? '') : base.scriptName,
      scenario: hasKey(item, 'scenario') ? (item.scenario ?? '') : base.scenario,
      status: hasKey(item, 'status') ? (item.status ?? 'queued') : base.status,
      exitCode: hasKey(item, 'exitCode') ? (item.exitCode ?? null) : base.exitCode,
      startTime: hasKey(item, 'startTime') ? (item.startTime ?? null) : base.startTime,
      endTime: hasKey(item, 'endTime') ? (item.endTime ?? null) : base.endTime
    }

    if (idx >= 0) items[idx] = next
    else items.push(next)
    writeAll(items)
    return cloneItem(next)
  }

  const list = (): TaskHistoryItem[] => {
    const items = readAll().map(cloneItem)
    items.sort((a, b) => {
      const ta = a.endTime ?? a.startTime ?? 0
      const tb = b.endTime ?? b.startTime ?? 0
      if (tb !== ta) return tb - ta
      return String(b.runId).localeCompare(String(a.runId))
    })
    return items
  }

  const applyStatusChange = (change: HistoryStatusChange): TaskHistoryItem => {
    const id = String(change.runId || '').trim()
    if (!id) throw new Error('runId is required')
    const ts = typeof change.ts === 'number' ? change.ts : now()

    const cur =
      get(id) ??
      ({
        runId: id,
        scriptName: change.status === 'queued' ? change.scriptName : '',
        scenario: change.status === 'queued' ? change.scenario : '',
        status: 'queued',
        exitCode: null,
        startTime: null,
        endTime: null
      } satisfies TaskHistoryItem)

    if (change.status === 'queued') {
      return upsert({
        ...cur,
        scriptName: change.scriptName,
        scenario: change.scenario,
        status: 'queued',
        exitCode: null
      })
    }

    if (change.status === 'running') {
      return upsert({
        ...cur,
        status: 'running',
        startTime: cur.startTime ?? ts,
        endTime: null,
        exitCode: null
      })
    }

    if (change.status === 'exited') {
      return upsert({
        ...cur,
        status: 'exited',
        exitCode: change.exitCode,
        endTime: ts
      })
    }

    if (change.status === 'error') {
      return upsert({
        ...cur,
        status: 'error',
        exitCode: cur.exitCode ?? null,
        endTime: ts
      })
    }

    return upsert({
      ...cur,
      status: 'cancelled',
      exitCode: cur.exitCode ?? null,
      endTime: ts
    })
  }

  return { upsert, list, get, applyStatusChange }
}
