export type OnboardingGuardDeps = {
  getState: () => Promise<{ completed: boolean }>
  navigate: (to: string, opts: { replace: true }) => void
}

export function createOnboardingGuardController(deps: OnboardingGuardDeps) {
  const run = async () => {
    try {
      const s = await deps.getState()
      if (!s.completed) deps.navigate('/onboarding', { replace: true })
    } catch {
      deps.navigate('/onboarding', { replace: true })
    }
  }

  return { run }
}

