import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { createServer, createConnection } from 'net'
import * as dotenv from 'dotenv'

log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024
autoUpdater.logger = log

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
  log.info('[backend] assigned port', backendPort)

  const isDev = !app.isPackaged
  const backendEntry = isDev
    ? join(__dirname, '../../../backend/src/index.ts')
    : join(process.resourcesPath, 'backend/index.js')

  const cmd = isDev ? 'npx' : process.execPath
  const args = isDev ? ['tsx', backendEntry] : [backendEntry]
  const backendDir = isDev
    ? join(__dirname, '../../../backend')
    : join(process.resourcesPath, 'backend')

  log.info('[backend] spawning', cmd, args.join(' '), 'in', backendDir)

  backendProcess = spawn(cmd, args, {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(backendPort),
      STORAGE_DIR: app.getPath('userData'),
      ...(!isDev && { ELECTRON_RUN_AS_NODE: '1', RESOURCES_PATH: process.resourcesPath }),
    },
    stdio: 'pipe',
    // shell:true lets Windows find npx.cmd via cmd.exe; not needed on mac/linux
    ...(isDev && process.platform === 'win32' && { shell: true }),
  })

  backendProcess.on('error', (err) => log.error('[backend] spawn failed', err))
  backendProcess.on('exit', (code, signal) => log.warn('[backend] exited code=%s signal=%s', code, signal))

  backendProcess.stdout?.on('data', (d) => log.info('[backend]', d.toString().trim()))
  backendProcess.stderr?.on('data', (d) => log.error('[backend]', d.toString().trim()))
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
  log.info('[app] ready — platform=%s arch=%s version=%s packaged=%s', process.platform, process.arch, app.getVersion(), app.isPackaged)
  log.info('[app] userData=%s', app.getPath('userData'))

  const envPaths = [
    join(process.resourcesPath, 'backend/.env'),
    join(app.getAppPath(), '../../.env'),
    join(app.getAppPath(), '../.env'),
    join(__dirname, '../../../../.env'),
  ]
  for (const p of envPaths) {
    const result = dotenv.config({ path: p })
    if (!result.error) log.info('[env] loaded %s', p)
  }

  await startBackend()
  log.info('[backend] spawned, waiting for port %d...', backendPort)
  await waitForBackend(backendPort)
  log.info('[backend] ready on port %d', backendPort)

  ipcMain.handle('get-backend-port', () => backendPort)
  createWindow(backendPort)
  log.info('[window] created')

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => log.error('[auto-update]', e))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(backendPort)
      log.info('[window] re-created on activate')
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  log.info('[app] quitting')
  backendProcess?.kill()
})
