import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getBackendPort(): Promise<number> {
    return ipcRenderer.invoke('get-backend-port')
  },
  openExternal(url: string): Promise<void> {
    return ipcRenderer.invoke('open-external', url)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
