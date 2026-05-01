import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { TaskConfig, taskConfigSchema, scriptEnum } from './configSchema'

export type TaskConfigFormProps = {
  defaultValues?: Partial<TaskConfig>
  onSubmit: (cfg: TaskConfig) => void
}

const scriptOptions = scriptEnum.options

export function TaskConfigForm(props: TaskConfigFormProps) {
  const defaults = useMemo<TaskConfig>(() => {
    return taskConfigSchema.parse({
      runId: props.defaultValues?.runId ?? '',
      script: props.defaultValues?.script ?? 'mock_device.py',
      scenario: props.defaultValues?.scenario ?? 'normal',
      gatewayWs: props.defaultValues?.gatewayWs ?? '',
      env: props.defaultValues?.env ?? {},
      advanced: {
        logLevel: props.defaultValues?.advanced?.logLevel ?? 'info',
        maxLogLines: props.defaultValues?.advanced?.maxLogLines ?? 1000,
        autoJumpToReport: props.defaultValues?.advanced?.autoJumpToReport ?? true
      }
    })
  }, [props.defaultValues])

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<TaskConfig>({
    resolver: zodResolver(taskConfigSchema),
    defaultValues: defaults
  })

  const env = watch('env')
  const envKeys = Object.keys(env || {})

  const submit = (v: TaskConfig) => {
    const runId = (v.runId || '').trim() || crypto.randomUUID()
    const finalCfg = { ...v, runId }
    setValue('runId', runId, { shouldDirty: true })
    props.onSubmit(finalCfg)
  }

  const addEnv = () => {
    const key = `KEY_${envKeys.length + 1}`
    setValue(`env.${key}` as const, '')
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="card">
      <div className="row">
        <label className="label">RunID</label>
        <input className="input" placeholder="留空自动生成" {...register('runId')} />
        {errors.runId && <div className="error">{errors.runId.message}</div>}
      </div>

      <div className="row">
        <label className="label">脚本</label>
        <select className="input" {...register('script')}>
          {scriptOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errors.script && <div className="error">{errors.script.message}</div>}
      </div>

      <div className="row">
        <label className="label">场景</label>
        <input className="input" {...register('scenario')} />
        {errors.scenario && <div className="error">{errors.scenario.message}</div>}
      </div>

      <div className="row">
        <label className="label">Gateway WS</label>
        <input className="input" placeholder="ws://..." {...register('gatewayWs')} />
      </div>

      <div className="row">
        <label className="label">高级</label>
        <div className="grid2">
          <label className="inline">
            <span>日志级别</span>
            <select className="input" {...register('advanced.logLevel')}>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>
          <label className="inline">
            <span>缓存行数</span>
            <input className="input" type="number" {...register('advanced.maxLogLines', { valueAsNumber: true })} />
          </label>
          <label className="inline">
            <span>自动跳转报告</span>
            <input type="checkbox" {...register('advanced.autoJumpToReport')} />
          </label>
        </div>
      </div>

      <div className="row">
        <label className="label">环境变量</label>
        <div className="env">
          <button type="button" className="btn" onClick={addEnv}>
            + 添加
          </button>
          {envKeys.length === 0 && <div className="muted">暂无</div>}
          {envKeys.map((k) => (
            <div key={k} className="env-row">
              <div className="env-key">{k}</div>
              <input className="input" {...register(`env.${k}` as const)} />
            </div>
          ))}
        </div>
      </div>

      <div className="row">
        <button type="submit" className="btn">
          开始任务
        </button>
      </div>
    </form>
  )
}

