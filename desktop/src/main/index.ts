import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { createServer } from 'net'
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

async function startBackend(): Promise<void> {
  backendPort = await getFreePort()

  const isDev = !app.isPackaged
  const backendEntry = isDev
    ? join(__dirname, '../../../backend/src/index.ts')
    : join(process.resourcesPath, 'backend/index.js')

  const cmd = isDev ? 'npx' : 'node'
  const args = isDev ? ['tsx', backendEntry] : [backendEntry]

  backendProcess = spawn(cmd, args, {
    env: { ...process.env, PORT: String(backendPort) },
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Pass backend port to renderer via query param
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('backend-port', port)
  })
}

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
  // Small delay for backend to start listening
  await new Promise(r => setTimeout(r, 1500))
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
