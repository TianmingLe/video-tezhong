import { contextBridge } from 'electron'
import type { DesktopApi } from './types'

const api: DesktopApi = {
  version: '0.0.1'
}

contextBridge.exposeInMainWorld('api', api)

