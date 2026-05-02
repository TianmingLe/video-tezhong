export type StartupMark = 'whenReady' | 'createWindow' | 'didFinishLoad' | 'readyToShow'

export type StartupMetricsSnapshot = {
  t0: number
  marks: Partial<Record<StartupMark, number>>
  deltas: Partial<Record<StartupMark, number>>
}

export class StartupMetrics {
  private readonly now: () => number
  private readonly t0: number
  private readonly marks: Partial<Record<StartupMark, number>> = {}

  constructor(args?: { now?: () => number }) {
    this.now = args?.now ?? (() => Date.now())
    this.t0 = this.now()
  }

  mark(name: StartupMark): void {
    if (this.marks[name] != null) return
    this.marks[name] = this.now()
  }

  getSnapshot(): StartupMetricsSnapshot {
    const deltas: StartupMetricsSnapshot['deltas'] = {}
    for (const [k, v] of Object.entries(this.marks) as Array<[StartupMark, number]>) {
      deltas[k] = v - this.t0
    }
    return { t0: this.t0, marks: { ...this.marks }, deltas }
  }
}

