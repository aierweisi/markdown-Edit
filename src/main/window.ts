import { app, BrowserWindow, dialog, shell } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type Store from 'electron-store'
import { EV, type StoreSchema } from '@shared/ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface WindowOpts {
  store: Store<StoreSchema>
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
  // A failed load otherwise yields a silent white window with no way forward.
  const onLoadFailed = (err: unknown): void => {
    console.error('[main] renderer load failed:', err)
    if (win.isDestroyed()) return
    void dialog
      .showMessageBox(win, {
        type: 'error',
        title: '加载失败',
        message: `界面加载失败：${err instanceof Error ? err.message : String(err)}`,
        buttons: ['退出'],
      })
      .then(() => app.quit())
  }
  if (rendererUrl) {
    win.loadURL(rendererUrl).catch(onLoadFailed)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html')).catch(onLoadFailed)
  }

  // A local editor has no use for web permissions (geolocation, notifications,
  // …); deny by default instead of Electron's approve-by-default.
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  attachExternalLinkHandler(win, rendererUrl)

  win.once('ready-to-show', () => {
    win.show()
    if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' })
  })

  // Debounced: `resize` fires continuously while dragging, and electron-store
  // writes are synchronous main-process disk I/O — one write per drag gesture,
  // not per tick. A trailing write on close still flushes the final size via
  // the timer (the store outlives the window).
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  win.on('resize', () => {
    if (boundsTimer != null) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      const [width, height] = win.getSize()
      opts.store.set('windowBounds', { width, height })
    }, 500)
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
  // The packaged entry point's canonical file:// URL — must match what
  // `loadFile(join(__dirname, '../renderer/index.html'))` actually loaded.
  // Compare against THIS exact URL, never a loose "/index.html" suffix: a
  // crafted `file:` link in a malicious note could otherwise navigate the
  // window to an attacker-controlled local page that still runs our preload.
  const appFileUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const isAppUrl = (target: string): boolean => {
    if (rendererUrl && target.startsWith(rendererUrl)) return true
    // Allow self-reload and same-page fragment navigation (index.html#anchor).
    return target === appFileUrl || target.startsWith(`${appFileUrl}#`) || target === 'about:blank'
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
