import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getBackendPort(): Promise<number> {
    return ipcRenderer.invoke('get-backend-port')
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
