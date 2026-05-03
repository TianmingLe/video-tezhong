import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { TaskConfig, taskConfigSchema, scriptEnum } from './configSchema'
import { useDbState } from '../../contexts/DbStateContext'

export type TaskConfigFormProps = {
  defaultValues?: Partial<TaskConfig>
  onSubmit: (cfg: TaskConfig) => void
}

const scriptOptions = scriptEnum.options

export function TaskConfigForm(props: TaskConfigFormProps) {
  const { isReadOnly } = useDbState()
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
    watch,
    getValues
  } = useForm<TaskConfig>({
    resolver: zodResolver(taskConfigSchema),
    defaultValues: defaults
  })

  const env = watch('env')
  const envKeys = Object.keys(env || {})
  const script = watch('script')
  const mc = watch('mediacrawler')

  useEffect(() => {
    if (script === 'mediacrawler') {
      const cur = getValues('mediacrawler')
      if (!cur) {
        setValue('mediacrawler', { kind: 'dy_mvp', specifiedId: '', enableLlm: false } as any, { shouldDirty: true })
      }
      if ((getValues('scenario') || '').trim() !== 'mediacrawler') {
        setValue('scenario', 'mediacrawler', { shouldDirty: true })
      }
      return
    }
    if (getValues('mediacrawler')) {
      setValue('mediacrawler', undefined as any, { shouldDirty: true })
    }
  }, [getValues, script, setValue])

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

  const saveAsTemplate = async () => {
    if (isReadOnly) return
    const name = window.prompt('模板名称')
    const trimmed = String(name || '').trim()
    if (!trimmed) return

    const v = getValues()
    try {
      const task_spec_json =
        v.script === 'mediacrawler'
          ? JSON.stringify({
              kind: v.mediacrawler?.kind,
              args:
                v.mediacrawler?.kind === 'dy_mvp'
                  ? { specifiedId: (v.mediacrawler as any).specifiedId, enableLlm: (v.mediacrawler as any).enableLlm }
                  : v.mediacrawler?.kind === 'xhs_search' || v.mediacrawler?.kind === 'bili_search'
                    ? {
                        keywords: (v.mediacrawler as any).keywords,
                        limit: (v.mediacrawler as any).limit,
                        enableLlm: (v.mediacrawler as any).enableLlm
                      }
                    : {}
            })
          : null
      const payload = {
        name: trimmed,
        script: v.script,
        scenario: v.scenario,
        gateway_ws: (v.gatewayWs || '').trim() || null,
        env: JSON.stringify(v.env || {}),
        is_default: 0 as const,
        task_spec_json
      }
      await window.api.kb.save(payload)
      window.alert('已保存为模板')
    } catch (e) {
      window.alert(String((e as Error).message || e))
    }
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

      {script === 'mediacrawler' ? (
        <div className="row">
          <label className="label">采集模板</label>
          <div className="grid2">
            <label className="inline">
              <span>类型</span>
              <select className="input" {...register('mediacrawler.kind' as const)}>
                <option value="dy_mvp">抖音 MVP</option>
                <option value="xhs_search">小红书搜索</option>
                <option value="bili_search">B站搜索</option>
              </select>
            </label>

            <label className="inline">
              <span>启用 LLM</span>
              <input type="checkbox" {...register('mediacrawler.enableLlm' as const)} />
            </label>
          </div>

          {mc?.kind === 'dy_mvp' ? (
            <div className="row" style={{ marginTop: 8 }}>
              <label className="label">视频链接/ID</label>
              <input className="input" placeholder="aweme url / aweme id" {...register('mediacrawler.specifiedId' as const)} />
            </div>
          ) : null}

          {mc?.kind === 'xhs_search' || mc?.kind === 'bili_search' ? (
            <div className="grid2" style={{ marginTop: 8 }}>
              <label className="inline">
                <span>关键词</span>
                <input className="input" {...register('mediacrawler.keywords' as const)} />
              </label>
              <label className="inline">
                <span>数量</span>
                <input className="input" type="number" {...register('mediacrawler.limit' as const, { valueAsNumber: true })} />
              </label>
            </div>
          ) : null}

          {errors.mediacrawler && <div className="error">{(errors.mediacrawler as any)?.message}</div>}
        </div>
      ) : null}

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
          <label className="inline">
            <span>重试次数</span>
            <input className="input" type="number" {...register('retry.maxAttempts', { valueAsNumber: true })} />
          </label>
          <label className="inline">
            <span>超时(ms)</span>
            <input className="input" type="number" {...register('limits.timeoutMs', { valueAsNumber: true })} />
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="btn">
            开始任务
          </button>
          <button
            type="button"
            className="btn"
            disabled={isReadOnly}
            title={isReadOnly ? '数据库只读模式，无法写入模板' : undefined}
            onClick={saveAsTemplate}
          >
            保存为模板
          </button>
        </div>
      </div>
    </form>
  )
}
