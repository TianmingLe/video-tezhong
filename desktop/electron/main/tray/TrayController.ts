import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import fs from 'node:fs'
import { getTrayIconCandidatePaths, pickFirstExistingPath, type TrayIconConfig } from './trayIcon'
import type { WindowController } from '../window/WindowController'
import { getDefaultTrayConfig, loadTrayConfig, saveTrayConfig, type TrayConfigFs } from './trayConfig'
import type { TrayConfig } from './types'
import { buildTrayMenuTemplate } from './trayMenu'

export type TrayRuntimeConfig = {
  tooltip?: string
  icon?: TrayIconConfig
  tray?: Partial<TrayConfig>
}

export type TrayControllerInitOptions = {
  windowController: WindowController
  config?: TrayRuntimeConfig
  onCancelRun?: (runId: string) => void | Promise<void>
  trayConfigPersistence?: { userDataPath: string; fs: TrayConfigFs }
}

export class TrayController {
  private static instance: TrayController | null = null
  private tray: Tray | null = null
  private windowController: WindowController | null = null
  private config: TrayRuntimeConfig = {}
  private trayConfig: TrayConfig = getDefaultTrayConfig(process.platform)
  private activeRunId: string | null = null
  private windowVisible = false
  private onCancelRun?: (runId: string) => void | Promise<void>
  private menu: Menu | null = null
  private trayConfigPersistence: { userDataPath: string; fs: TrayConfigFs } | null = null

  static getInstance(): TrayController {
    if (!TrayController.instance) TrayController.instance = new TrayController()
    return TrayController.instance
  }

  init(opts: TrayControllerInitOptions): void {
    this.windowController = opts.windowController
    this.config = opts.config ?? {}
    this.trayConfigPersistence = opts.trayConfigPersistence ?? this.trayConfigPersistence
    const base = this.trayConfigPersistence
      ? loadTrayConfig({ platform: process.platform, userDataPath: this.trayConfigPersistence.userDataPath, fs: this.trayConfigPersistence.fs })
      : getDefaultTrayConfig(process.platform)
    this.trayConfig = { ...base, ...(this.config.tray ?? {}) }
    this.onCancelRun = opts.onCancelRun

    if (this.tray) {
      this.refreshMenu()
      return
    }

    const icon = this.resolveIcon()
    this.tray = new Tray(icon)
    if (this.config.tooltip) this.tray.setToolTip(this.config.tooltip)

    this.tray.on('right-click', () => this.handleRightClick())
    this.tray.on('click', () => this.handleLeftClick())

    this.refreshMenu()
  }

  updateTrayConfig(partial: Partial<TrayConfig>): TrayConfig {
    this.trayConfig = { ...this.trayConfig, ...partial }
    if (this.trayConfigPersistence) {
      saveTrayConfig({
        userDataPath: this.trayConfigPersistence.userDataPath,
        fs: this.trayConfigPersistence.fs,
        config: this.trayConfig
      })
    }
    this.refreshMenu()
    return this.trayConfig
  }

  getTrayConfig(): TrayConfig {
    return this.trayConfig
  }

  setActiveRunId(runId: string | null): void {
    this.activeRunId = runId
    this.refreshMenu()
  }

  setWindowVisible(visible: boolean): void {
    this.windowVisible = visible
    this.refreshMenu()
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
    this.menu = null
  }

  private resolveIcon() {
    const candidates = getTrayIconCandidatePaths({
      platform: process.platform,
      icon: this.config.icon,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      cwd: process.cwd()
    })
    const iconPath = pickFirstExistingPath(candidates, fs.existsSync)
    if (iconPath) {
      const img = nativeImage.createFromPath(iconPath)
      if (process.platform === 'darwin' && typeof img.setTemplateImage === 'function') img.setTemplateImage(true)
      if (!img.isEmpty()) return img
    }

    if (process.platform === 'darwin' && typeof nativeImage.createFromNamedImage === 'function') {
      const img = nativeImage.createFromNamedImage('NSImageNameActionTemplate')
      if (typeof img.setTemplateImage === 'function') img.setTemplateImage(true)
      if (!img.isEmpty()) return img
    }

    const tiny = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P8z/D/PwAHggJ/P9x6VwAAAABJRU5ErkJggg=='
    )
    if (!tiny.isEmpty()) return tiny
    return nativeImage.createEmpty()
  }

  private handleLeftClick(): void {
    const behavior = this.trayConfig.leftClick
    if (!this.tray) return
    if (behavior === 'menu') this.popUpMenu()
    if (behavior === 'toggle') this.windowController?.toggleVisibility()
  }

  private handleRightClick(): void {
    if (!this.tray) return
    if (this.trayConfig.rightClick === 'menu') this.popUpMenu()
  }

  private popUpMenu(): void {
    if (!this.tray) return
    if (!this.menu) this.refreshMenu()
    const menu = this.menu
    if (!menu) return
    this.tray.popUpContextMenu(menu)
  }

  private refreshMenu(): void {
    if (!this.windowController) return
    const tpl = buildTrayMenuTemplate({
      platform: process.platform,
      isVisible: this.windowVisible,
      hasRunningJob: !!this.activeRunId,
      leftClickMode: this.trayConfig.leftClick
    })

    const template: MenuItemConstructorOptions[] = tpl.map((it) => {
      if (it.type === 'separator') return it
      const id = it.id
      if (id === 'toggle_window') {
        return { ...it, click: () => this.windowController?.toggleVisibility() }
      }
      if (id === 'open_tasks') {
        return {
          ...it,
          click: () => {
            this.windowController?.show()
            this.windowController?.getWindow()?.focus()
            this.windowController?.getWindow()?.webContents.send('app:navigate', { path: '/tasks' })
          }
        }
      }
      if (id === 'open_report') {
        return {
          ...it,
          click: () => {
            this.windowController?.show()
            this.windowController?.getWindow()?.focus()
            const rid = this.activeRunId
            const path = rid ? `/report/${rid}` : '/reports'
            this.windowController?.getWindow()?.webContents.send('app:navigate', { path })
          }
        }
      }
      if (id === 'cancel_job') {
        return {
          ...it,
          click: async () => {
            const runId = this.activeRunId
            if (!runId) return
            await this.onCancelRun?.(runId)
          }
        }
      }
      if (id === 'quit') {
        return { ...it, click: () => app.quit() }
      }
      return it
    })

    this.menu = Menu.buildFromTemplate(template)
    if (this.trayConfig.rightClick === 'menu') this.tray?.setContextMenu(this.menu)
    else this.tray?.setContextMenu(null)
    this.refreshBadge()
  }

  private refreshBadge(): void {
    const tray = this.tray
    if (!tray) return
    const setTitle = (tray as unknown as { setTitle?: (title: string) => void }).setTitle
    if (typeof setTitle !== 'function') return
    if (!this.trayConfig.showBadgeOnRunning) {
      setTitle('')
      return
    }
    if (!this.activeRunId) {
      setTitle('')
      return
    }
    setTitle('●')
  }
}
