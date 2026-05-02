import type { BrowserWindow } from 'electron'

export type WindowVisibilityChangeHandler = (visible: boolean) => void

export type WindowControllerOptions = {
  createWindow: () => BrowserWindow
  onWindowVisibilityChange?: WindowVisibilityChangeHandler
}

export class WindowController {
  private window: BrowserWindow | null = null
  private onWindowVisibilityChange?: WindowVisibilityChangeHandler
  private createWindow: () => BrowserWindow

  constructor(opts: WindowControllerOptions) {
    this.createWindow = opts.createWindow
    this.onWindowVisibilityChange = opts.onWindowVisibilityChange
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  ensureWindow(): BrowserWindow {
    if (this.window) return this.window
    const win = this.createWindow()
    this.window = win
    this.attachWindowListeners(win)
    return win
  }

  show(): void {
    const win = this.ensureWindow()
    if (typeof win.isMinimized === 'function' && win.isMinimized()) {
      if (typeof win.restore === 'function') win.restore()
    }
    win.show()
  }

  hide(): void {
    this.window?.hide()
  }

  toggleVisibility(): void {
    const win = this.ensureWindow()
    if (win.isVisible()) this.hide()
    else this.show()
  }

  private attachWindowListeners(win: BrowserWindow): void {
    win.on('show', () => this.onWindowVisibilityChange?.(true))
    win.on('hide', () => this.onWindowVisibilityChange?.(false))
    win.on('closed', () => {
      this.window = null
      this.onWindowVisibilityChange?.(false)
    })
  }
}
