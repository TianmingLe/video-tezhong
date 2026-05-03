import { runWithRetry, type SqliteDb } from './index'
import type { TaskRecord, TaskStatus } from './types'

export type TaskInsert = Omit<TaskRecord, 'id' | 'task_spec_json' | 'attempt' | 'max_attempts'> &
  Partial<Pick<TaskRecord, 'task_spec_json' | 'attempt' | 'max_attempts'>>

export type TaskStatusUpdate = {
  run_id: string
  status: TaskStatus
} & Partial<Pick<TaskRecord, 'exit_code' | 'start_time' | 'end_time' | 'duration' | 'task_spec_json' | 'attempt' | 'max_attempts'>>

export type TasksRepo = {
  insert: (input: TaskInsert) => TaskRecord
  updateStatus: (input: TaskStatusUpdate) => TaskRecord
  getAll: () => TaskRecord[]
  getById: (runId: string) => TaskRecord | null
}

function hasKey<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export function createTasksRepo(db: SqliteDb): TasksRepo {
  const getById = (runId: string): TaskRecord | null => {
    const id = String(runId || '').trim()
    if (!id) return null
    const row = db.prepare('select * from tasks where run_id=?').get(id) as TaskRecord | undefined
    return row ?? null
  }

  const insert = (input: TaskInsert): TaskRecord => {
    const run_id = String(input.run_id || '').trim()
    const script = String(input.script || '').trim()
    const scenario = String(input.scenario || '').trim()
    const status = input.status

    if (!run_id) throw new Error('run_id is required')
    if (!script) throw new Error('script is required')
    if (!scenario) throw new Error('scenario is required')
    if (!status) throw new Error('status is required')

    runWithRetry(() => {
      db.prepare(
        `insert into tasks(run_id, script, scenario, status, exit_code, start_time, end_time, duration, task_spec_json, attempt, max_attempts)
         values(@run_id, @script, @scenario, @status, @exit_code, @start_time, @end_time, @duration, @task_spec_json, @attempt, @max_attempts)`
      ).run({
        run_id,
        script,
        scenario,
        status,
        exit_code: input.exit_code ?? null,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        duration: input.duration ?? null,
        task_spec_json: input.task_spec_json ?? null,
        attempt: input.attempt ?? null,
        max_attempts: input.max_attempts ?? null
      })
    })

    const row = getById(run_id)
    if (!row) throw new Error('insert failed')
    return row
  }

  const updateStatus = (input: TaskStatusUpdate): TaskRecord => {
    const run_id = String(input.run_id || '').trim()
    if (!run_id) throw new Error('run_id is required')

    const sets: string[] = ['status=@status']
    if (hasKey(input, 'exit_code')) sets.push('exit_code=@exit_code')
    if (hasKey(input, 'start_time')) sets.push('start_time=@start_time')
    if (hasKey(input, 'end_time')) sets.push('end_time=@end_time')
    if (hasKey(input, 'duration')) sets.push('duration=@duration')
    if (hasKey(input, 'task_spec_json')) sets.push('task_spec_json=@task_spec_json')
    if (hasKey(input, 'attempt')) sets.push('attempt=@attempt')
    if (hasKey(input, 'max_attempts')) sets.push('max_attempts=@max_attempts')

    const res = runWithRetry(() => db.prepare(`update tasks set ${sets.join(', ')} where run_id=@run_id`).run(input))
    if (res.changes <= 0) throw new Error('task not found')

    const row = getById(run_id)
    if (!row) throw new Error('task not found')
    return row
  }

  const getAll = (): TaskRecord[] => {
    const rows = db
      .prepare('select * from tasks order by coalesce(end_time, start_time, 0) desc, run_id desc')
      .all() as TaskRecord[]
    return rows
  }

  return { insert, updateStatus, getAll, getById }
}
