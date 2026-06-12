import { app, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Store from 'electron-store'
import { EV, type StoreSchema } from '@shared/ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface WindowOpts {
  store: Store<StoreSchema>
  onClose(win: BrowserWindow, isQuitting: boolean): Promise<void> | void
}

export function createMainWindow(opts: WindowOpts): BrowserWindow {
  const bounds = opts.store.get('windowBounds')
  const iconPath = join(__dirname, '../../assets/icons/icon.ico')
  const isMac = process.platform === 'darwin'

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 600,
    icon: existsSync(iconPath) ? iconPath : undefined,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 16 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#0a0a0c',
    show: false,
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' })
  })

  win.on('resize', () => {
    const [width, height] = win.getSize()
    opts.store.set('windowBounds', { width, height })
  })

  win.on('maximize', () => win.webContents.send(EV.WIN_MAXIMIZED, true))
  win.on('unmaximize', () => win.webContents.send(EV.WIN_MAXIMIZED, false))

  return win
}
