import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { createServer, createConnection } from 'net'
import * as dotenv from 'dotenv'

let backendProcess: ChildProcess | null = null
let backendPort = 3001

function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.listen(0, () => {
      const addr = srv.address() as { port: number }
      srv.close(() => resolve(addr.port))
    })
  })
}

function waitForBackend(port: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const tryConnect = () => {
      const sock = createConnection(port, '127.0.0.1')
      sock.on('connect', () => { sock.destroy(); resolve() })
      sock.on('error', () => {
        sock.destroy()
        if (Date.now() >= deadline) reject(new Error(`Backend on port ${port} failed to start within ${timeoutMs}ms`))
        else setTimeout(tryConnect, 200)
      })
    }
    tryConnect()
  })
}

async function startBackend(): Promise<void> {
  backendPort = await getFreePort()

  const isDev = !app.isPackaged
  const backendEntry = isDev
    ? join(__dirname, '../../../backend/src/index.ts')
    : join(process.resourcesPath, 'backend/index.js')

  const cmd = isDev ? 'npx' : 'node'
  const args = isDev ? ['tsx', backendEntry] : [backendEntry]
  const backendDir = isDev
    ? join(__dirname, '../../../backend')
    : join(process.resourcesPath, 'backend')

  backendProcess = spawn(cmd, args, {
    cwd: backendDir,
    env: { ...process.env, PORT: String(backendPort), STORAGE_DIR: app.getPath('userData') },
    stdio: 'pipe',
  })

  backendProcess.stdout?.on('data', (d) => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr?.on('data', (d) => console.error('[backend]', d.toString().trim()))
}

function createWindow(port: number): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url)
      if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url)
    } catch {}
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.setName('OpenParsed')

app.whenReady().then(async () => {
  // Load .env — search from app path upward
  for (const p of [
    join(app.getAppPath(), '../../.env'),
    join(app.getAppPath(), '../.env'),
    join(__dirname, '../../../../.env'),
  ]) {
    dotenv.config({ path: p })
  }

  await startBackend()
  await waitForBackend(backendPort)

  ipcMain.handle('get-backend-port', () => backendPort)
  ipcMain.handle('get-license-config', () => ({
    url: process.env['LICENSE_URL'] ?? null,
    token: process.env['LICENSE_TOKEN'] ?? null,
  }))
  createWindow(backendPort)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(backendPort)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  backendProcess?.kill()
})
