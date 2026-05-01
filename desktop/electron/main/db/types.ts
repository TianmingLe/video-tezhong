export type TaskStatus = 'queued' | 'running' | 'exited' | 'error' | 'cancelled'

export type TaskRecord = {
  id: number
  run_id: string
  script: string
  scenario: string
  status: TaskStatus
  exit_code: number | null
  start_time: number | null
  end_time: number | null
  duration: number | null
}

export type ConfigRecord = {
  id: number
  name: string
  script: string
  scenario: string
  gateway_ws: string | null
  env: string
  is_default: 0 | 1
}

