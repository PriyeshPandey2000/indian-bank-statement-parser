import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getBackendPort(): Promise<number> {
    return ipcRenderer.invoke('get-backend-port')
  },
  getLicenseConfig(): Promise<{ url: string | null; token: string | null }> {
    return ipcRenderer.invoke('get-license-config')
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
