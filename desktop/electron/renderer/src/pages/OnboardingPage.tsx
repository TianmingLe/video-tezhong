import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CheckPythonResult } from '../../../preload/types'
import { Skeleton } from '../components/Skeleton'

type PythonViewState =
  | { status: 'idle'; result: null }
  | { status: 'loading'; result: null }
  | { status: 'done'; result: CheckPythonResult }

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [python, setPython] = useState<PythonViewState>({ status: 'idle', result: null })
  const [completing, setCompleting] = useState(false)

  const runPythonCheck = () => {
    setPython({ status: 'loading', result: null })
    window.api.system
      .checkPython()
      .then((res) => setPython({ status: 'done', result: res }))
      .catch((e) =>
        setPython({
          status: 'done',
          result: {
            ok: false,
            error: String((e as Error)?.message || e),
            suggestion: '检测失败：请确认已安装 Python 3，并能在终端运行 python3 --version 或 python --version。'
          }
        })
      )
  }

  useEffect(() => {
    let cancelled = false
    window.api.onboarding.getState().then((s) => {
      if (cancelled) return
      if (s.completed) navigate('/tasks', { replace: true })
    })
    runPythonCheck()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const complete = async () => {
    if (completing) return
    setCompleting(true)
    try {
      await window.api.onboarding.complete()
    } finally {
      navigate('/tasks', { replace: true })
    }
  }

  const canPrev = step !== 1
  const canNext = step !== 3

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">首次使用引导</h1>
      <p className="page-subtitle">3 步完成基础检查与快速上手。</p>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="label" style={{ marginBottom: 0 }}>
            当前步骤
          </div>
          <div className="muted">
            {step} / 3
          </div>
        </div>
      </div>

      {step === 1 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>欢迎</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            OmniScraper Desktop 通过本地 Python 脚本执行任务。接下来会检测 Python 环境，并引导你进入任务页。
          </p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Python 环境检测</h2>
          <div style={{ marginTop: 12 }}>
            {python.status === 'loading' ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <Skeleton height={16} />
                <Skeleton height={16} width="70%" />
                <Skeleton height={16} width="90%" />
              </div>
            ) : python.status === 'done' ? (
              python.result.ok ? (
                <div>
                  <div className="muted">检测成功</div>
                  <div style={{ marginTop: 6 }}>
                    <span className="label" style={{ marginBottom: 0 }}>
                      版本：
                    </span>
                    <span>{python.result.version}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="error">检测失败：{python.result.error}</div>
                  <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                    {python.result.suggestion}
                  </div>
                </div>
              )
            ) : (
              <div className="muted">等待检测…</div>
            )}
          </div>

          <div className="toolbar" style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={runPythonCheck} disabled={python.status === 'loading'}>
              重新检测
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>完成</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            你已准备就绪。即使 Python 检测失败也可以先进入应用，后续再在系统环境中修复。
          </p>
          <div className="toolbar" style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={complete} disabled={completing}>
              进入应用
            </button>
          </div>
        </div>
      ) : null}

      <div className="toolbar" style={{ marginTop: 16 }}>
        <button type="button" className="btn" disabled={!canPrev} onClick={() => setStep((s) => (s === 2 ? 1 : 2))}>
          上一步
        </button>
        <button type="button" className="btn" disabled={!canNext} onClick={() => setStep((s) => (s === 1 ? 2 : 3))}>
          下一步
        </button>
      </div>
    </div>
  )
}

