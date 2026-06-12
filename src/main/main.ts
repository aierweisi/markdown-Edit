import { app, BrowserWindow } from 'electron'
import ElectronStore from 'electron-store'
import type { StoreSchema } from '@shared/ipc'
import type { MenuEventName } from '@shared/ipc'
import { defaults, migrateStore } from './store-schema'
import { createMainWindow } from './window'
import { createTray } from './tray'
import { setupApplicationMenu } from './menu'
import { registerAllIpc } from './ipc'
import {
  extractFileArg,
  hasPendingFile,
  sendOpenFile,
  setPending,
  takePendingPath,
} from './os-file'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

const store = new ElectronStore<StoreSchema>({ defaults }) as ElectronStore<StoreSchema>
migrateStore(store)

function getWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function dispatchMenu(channel: MenuEventName): void {
  getWindow()?.webContents.send(channel)
}

function onQuit(): void {
  isQuitting = true
}

function attachCloseHandler(win: BrowserWindow): void {
  win.on('close', (evt) => {
    evt.preventDefault()
    const save = win.webContents
      .executeJavaScript("typeof CacheManager!=='undefined'&&CacheManager.saveAll()")
      .catch(() => undefined)

    if (!isQuitting) {
      void save
      win.hide()
      return
    }
    void save.then(() => {
      if (!win.isDestroyed()) win.destroy()
    })
  })
}

async function createWindow(): Promise<void> {
  mainWindow = createMainWindow({
    store,
    onClose: () => undefined,
  })
  attachCloseHandler(mainWindow)
  mainWindow.webContents.on('did-finish-load', () => {
    const pending = takePendingPath()
    if (pending && mainWindow) sendOpenFile(mainWindow, pending)
  })

  createTray({ getWindow, onQuit })
  setupApplicationMenu({ sendToRenderer: dispatchMenu, onQuit })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const path = extractFileArg(argv)
    if (path) sendOpenFile(getWindow(), path)
    const win = getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    const win = getWindow()
    if (win) sendOpenFile(win, filePath)
    else setPending(filePath)
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })

  void app.whenReady().then(async () => {
    const initial = extractFileArg(process.argv)
    if (initial) setPending(initial)

    registerAllIpc({ store, getWindow, hasPendingFile })
    await createWindow()
  })
}
