import { ElectronAPI } from '@electron-toolkit/preload'
import type { OrchFlowAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    orchflow: OrchFlowAPI
    api: typeof window.orchflow
  }
}

export {}
