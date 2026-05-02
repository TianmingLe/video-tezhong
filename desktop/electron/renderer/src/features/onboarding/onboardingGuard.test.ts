import { describe, expect, test, vi } from 'vitest'
import { createOnboardingGuardController } from './onboardingGuard'

describe('createOnboardingGuardController', () => {
  test('completed=false 时会 replace 跳转到 /onboarding', async () => {
    const getState = vi.fn(async () => ({ version: 1 as const, completed: false }))
    const navigate = vi.fn()
    const controller = createOnboardingGuardController({ getState, navigate })

    await controller.run()

    expect(getState).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/onboarding', { replace: true })
  })

  test('completed=true 时不跳转', async () => {
    const getState = vi.fn(async () => ({ version: 1 as const, completed: true }))
    const navigate = vi.fn()
    const controller = createOnboardingGuardController({ getState, navigate })

    await controller.run()

    expect(getState).toHaveBeenCalledOnce()
    expect(navigate).not.toHaveBeenCalled()
  })
})

