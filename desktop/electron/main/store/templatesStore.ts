import { randomUUID } from 'node:crypto'
import type { TaskTemplate, TaskTemplateSaveInput } from '../../preload/types'

export type StoreAdapter = {
  get: <T>(key: string) => T | undefined
  set: <T>(key: string, value: T) => void
}

export type TemplatesStore = {
  list: () => TaskTemplate[]
  save: (input: TaskTemplateSaveInput) => TaskTemplate
}

export function createTemplatesStore(args: {
  adapter: StoreAdapter
  key: string
  now?: () => number
  generateId?: () => string
}): TemplatesStore {
  const now = args.now ?? (() => Date.now())
  const generateId = args.generateId ?? (() => randomUUID())

  const readAll = (): TaskTemplate[] => normalizeTemplates(args.adapter.get<unknown>(args.key))

  const writeAll = (items: TaskTemplate[]) => {
    args.adapter.set(args.key, items.map(cloneTemplate))
  }

  const list = (): TaskTemplate[] => {
    const items = readAll().map(cloneTemplate)
    items.sort((a, b) => b.createdAt - a.createdAt)
    return items
  }

  const save = (input: TaskTemplateSaveInput): TaskTemplate => {
    const title = String(input?.title || '').trim()
    const tags = Array.isArray(input?.tags) ? input.tags.map((t) => String(t || '').trim()).filter(Boolean) : []
    const config = {
      scriptName: String(input?.config?.scriptName || '').trim(),
      scenario: String(input?.config?.scenario || '').trim()
    }

    if (!title) throw new Error('title is required')
    if (!config.scriptName) throw new Error('config.scriptName is required')
    if (!config.scenario) throw new Error('config.scenario is required')

    const item: TaskTemplate = {
      id: generateId(),
      title,
      tags: Array.from(new Set(tags)),
      createdAt: now(),
      config
    }

    const items = readAll()
    writeAll([item, ...items])
    return cloneTemplate(item)
  }

  return { list, save }
}

function cloneTemplate(it: TaskTemplate): TaskTemplate {
  return {
    id: it.id,
    title: it.title,
    tags: [...it.tags],
    createdAt: it.createdAt,
    config: { ...it.config }
  }
}

function normalizeTemplates(v: unknown): TaskTemplate[] {
  if (!Array.isArray(v)) return []
  const out: TaskTemplate[] = []
  for (const raw of v) {
    const it = normalizeTemplate(raw)
    if (it) out.push(it)
  }
  return out
}

function normalizeTemplate(v: unknown): TaskTemplate | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  const createdAt = typeof o.createdAt === 'number' ? o.createdAt : NaN
  const tags = Array.isArray(o.tags) ? o.tags.map((t) => String(t || '').trim()).filter(Boolean) : []

  const cfgRaw = o.config
  const cfgObj = cfgRaw && typeof cfgRaw === 'object' ? (cfgRaw as Record<string, unknown>) : null
  const scriptName = cfgObj && typeof cfgObj.scriptName === 'string' ? cfgObj.scriptName.trim() : ''
  const scenario = cfgObj && typeof cfgObj.scenario === 'string' ? cfgObj.scenario.trim() : ''

  if (!id || !title) return null
  if (!Number.isFinite(createdAt)) return null
  if (!scriptName || !scenario) return null

  return { id, title, tags: Array.from(new Set(tags)), createdAt, config: { scriptName, scenario } }
}
