import { app, BrowserWindow, shell } from 'electron'
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
      // sandbox stays off: the preload (externalized via externalizeDepsPlugin)
      // transitively requires `zod` (through @shared/ipc), and the sandbox's
      // restricted require can only load electron built-ins — so in packaged
      // builds the preload throws and window.api is never exposed. Re-enable
      // only after the preload bundle no longer requires any third-party dep.
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

  attachExternalLinkHandler(win, rendererUrl)

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

/**
 * Intercept link navigation inside the renderer so http(s)/mailto/tel URLs open
 * in the user's default browser instead of replacing the app's UI. `file:` is
 * deliberately NOT forwarded to the OS handler — doing so would let a crafted
 * link (e.g. file:///C:/.../something.exe) launch arbitrary local programs.
 * The app itself only ever stays on its own renderer URL.
 */
function attachExternalLinkHandler(win: BrowserWindow, rendererUrl: string | undefined): void {
  const isAppUrl = (target: string): boolean => {
    if (rendererUrl && target.startsWith(rendererUrl)) return true
    if (target.startsWith('file://') && target.endsWith('/index.html')) return true
    return target === 'about:blank'
  }

  const openExternal = (target: string): void => {
    if (!/^(?:https?|mailto|tel):/i.test(target)) return
    void shell.openExternal(target)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openExternal(url)
  })
}
