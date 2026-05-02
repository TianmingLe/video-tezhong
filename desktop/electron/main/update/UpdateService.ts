import { EventEmitter } from 'node:events'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'downloading'; progress?: DownloadProgress }
  | { status: 'downloaded' }
  | { status: 'notAvailable' }
  | { status: 'error'; error: string }

export type DownloadProgress = {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export type UpdateEvent =
  | { name: 'update-available'; state: UpdateState; payload?: unknown }
  | { name: 'update-not-available'; state: UpdateState; payload?: unknown }
  | { name: 'download-progress'; state: UpdateState; payload: DownloadProgress }
  | { name: 'update-downloaded'; state: UpdateState; payload?: unknown }
  | { name: 'error'; state: UpdateState; payload: { message: string } }
  | { name: 'state'; state: UpdateState }

type UpdateEventNoState =
  | { name: 'update-available'; payload?: unknown }
  | { name: 'update-not-available'; payload?: unknown }
  | { name: 'download-progress'; payload: DownloadProgress }
  | { name: 'update-downloaded'; payload?: unknown }
  | { name: 'error'; payload: { message: string } }

export type UpdateInstallResult = { success: true } | { success: false; error: string }

export type AutoUpdaterLike = EventEmitter & {
  checkForUpdates: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  quitAndInstall: () => void
}

export class UpdateService {
  private state: UpdateState = { status: 'idle' }
  private readonly events = new EventEmitter()
  private readonly autoDownload: boolean

  constructor(
    private readonly autoUpdater: AutoUpdaterLike,
    opts?: {
      autoDownload?: boolean
    }
  ) {
    this.autoDownload = opts?.autoDownload ?? true

    this.autoUpdater.on('update-available', (payload) => {
      this.setState({ status: 'available' })
      this.emitEvent({ name: 'update-available', payload })
      if (this.autoDownload) void this.download()
    })
    this.autoUpdater.on('update-not-available', (payload) => {
      this.setState({ status: 'notAvailable' })
      this.emitEvent({ name: 'update-not-available', payload })
    })
    this.autoUpdater.on('download-progress', (payload: unknown) => {
      const p = this.coerceProgress(payload)
      this.setState({ status: 'downloading', progress: p })
      this.emitEvent({ name: 'download-progress', payload: p })
    })
    this.autoUpdater.on('update-downloaded', (payload) => {
      this.setState({ status: 'downloaded' })
      this.emitEvent({ name: 'update-downloaded', payload })
    })
    this.autoUpdater.on('error', (err: unknown) => {
      const message = this.toErrorMessage(err)
      this.setState({ status: 'error', error: message })
      this.emitEvent({ name: 'error', payload: { message } })
    })
  }

  getState(): UpdateState {
    return this.state
  }

  onEvent(cb: (ev: UpdateEvent) => void): () => void {
    const handler = (ev: unknown) => cb(ev as UpdateEvent)
    this.events.on('event', handler)
    return () => this.events.removeListener('event', handler)
  }

  async check(): Promise<UpdateState> {
    this.setState({ status: 'checking' })
    try {
      await this.autoUpdater.checkForUpdates()
    } catch (err) {
      const message = this.toErrorMessage(err)
      this.setState({ status: 'error', error: message })
      this.emitEvent({ name: 'error', payload: { message } })
    }
    return this.state
  }

  async install(): Promise<UpdateInstallResult> {
    if (this.state.status !== 'downloaded') return { success: false, error: 'not_downloaded' }
    this.autoUpdater.quitAndInstall()
    return { success: true }
  }

  private async download(): Promise<void> {
    if (this.state.status === 'downloading' || this.state.status === 'downloaded') return
    this.setState({ status: 'downloading' })
    try {
      await this.autoUpdater.downloadUpdate()
    } catch (err) {
      const message = this.toErrorMessage(err)
      this.setState({ status: 'error', error: message })
      this.emitEvent({ name: 'error', payload: { message } })
    }
  }

  private setState(next: UpdateState): void {
    this.state = next
    this.events.emit('event', { name: 'state', state: next })
  }

  private emitEvent(ev: UpdateEventNoState): void {
    this.events.emit('event', { ...ev, state: this.state } as UpdateEvent)
  }

  private toErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message || 'unknown error'
    return String(err || 'unknown error')
  }

  private coerceProgress(payload: unknown): DownloadProgress {
    const o = (payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}) ?? {}
    const bytesPerSecond = Number(o.bytesPerSecond ?? 0)
    const percent = Number(o.percent ?? 0)
    const transferred = Number(o.transferred ?? 0)
    const total = Number(o.total ?? 0)
    return {
      bytesPerSecond: Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0,
      percent: Number.isFinite(percent) ? percent : 0,
      transferred: Number.isFinite(transferred) ? transferred : 0,
      total: Number.isFinite(total) ? total : 0
    }
  }
}
