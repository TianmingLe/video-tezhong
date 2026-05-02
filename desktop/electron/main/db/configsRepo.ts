import { runWithRetry, type SqliteDb } from './index'
import type { ConfigRecord } from './types'

export type ConfigInsert = {
  name: string
  script: string
  scenario: string
  gateway_ws?: string | null
  env: string
  is_default?: 0 | 1
  task_spec_json?: string | null
}

export type ConfigUpdate = { id: number } & Partial<Omit<ConfigRecord, 'id'>>

export type ConfigsRepo = {
  insert: (input: ConfigInsert) => ConfigRecord
  getAll: () => ConfigRecord[]
  update: (input: ConfigUpdate) => ConfigRecord
  setDefault: (id: number) => ConfigRecord
}

function hasKey<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export function createConfigsRepo(db: SqliteDb): ConfigsRepo {
  const getById = (id: number): ConfigRecord | null => {
    const n = Number(id)
    if (!Number.isFinite(n)) return null
    const row = db.prepare('select * from configs where id=?').get(n) as ConfigRecord | undefined
    return row ?? null
  }

  const insert = (input: ConfigInsert): ConfigRecord => {
    const name = String(input.name || '').trim()
    const script = String(input.script || '').trim()
    const scenario = String(input.scenario || '').trim()

    if (!name) throw new Error('name is required')
    if (!script) throw new Error('script is required')
    if (!scenario) throw new Error('scenario is required')

    const res = runWithRetry(() =>
      db.prepare(
        `insert into configs(name, script, scenario, gateway_ws, env, is_default, task_spec_json)
         values(@name, @script, @scenario, @gateway_ws, @env, @is_default, @task_spec_json)`
      ).run({
        name,
        script,
        scenario,
        gateway_ws: input.gateway_ws ?? null,
        env: String(input.env ?? ''),
        is_default: input.is_default ?? 0,
        task_spec_json: input.task_spec_json ?? null
      })
    )

    const row = getById(Number(res.lastInsertRowid))
    if (!row) throw new Error('insert failed')
    return row
  }

  const getAll = (): ConfigRecord[] => {
    const rows = db.prepare('select * from configs order by is_default desc, id desc').all() as ConfigRecord[]
    return rows
  }

  const update = (input: ConfigUpdate): ConfigRecord => {
    const cur = getById(input.id)
    if (!cur) throw new Error('config not found')

    const sets: string[] = []
    if (hasKey(input, 'name')) sets.push('name=@name')
    if (hasKey(input, 'script')) sets.push('script=@script')
    if (hasKey(input, 'scenario')) sets.push('scenario=@scenario')
    if (hasKey(input, 'gateway_ws')) sets.push('gateway_ws=@gateway_ws')
    if (hasKey(input, 'env')) sets.push('env=@env')
    if (hasKey(input, 'is_default')) sets.push('is_default=@is_default')
    if (hasKey(input, 'task_spec_json')) sets.push('task_spec_json=@task_spec_json')

    if (sets.length === 0) return cur

    const res = runWithRetry(() => db.prepare(`update configs set ${sets.join(', ')} where id=@id`).run(input))
    if (res.changes <= 0) throw new Error('config not found')

    const row = getById(input.id)
    if (!row) throw new Error('config not found')
    return row
  }

  const setDefault = (id: number): ConfigRecord => {
    const tx = db.transaction(() => {
      db.prepare('update configs set is_default=0').run()
      const res = db.prepare('update configs set is_default=1 where id=?').run(id)
      if (res.changes <= 0) throw new Error('config not found')
      const row = getById(id)
      if (!row) throw new Error('config not found')
      return row
    })
    return runWithRetry(() => tx())
  }

  return { insert, getAll, update, setDefault }
}
