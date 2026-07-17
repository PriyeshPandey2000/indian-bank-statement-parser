import { contextBridge, ipcRenderer } from 'electron'

const api = {
  onBackendPort(cb: (port: number) => void): void {
    ipcRenderer.on('backend-port', (_event, port: number) => cb(port))
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
