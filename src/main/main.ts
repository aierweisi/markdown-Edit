import { app, BrowserWindow, dialog } from 'electron'
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
  flushPendingFile,
  hasPendingFile,
  sendOpenFile,
  setPending,
} from './os-file'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// Last-resort handlers: without these, a rejected promise or thrown error on
// the main process crashes the event loop's error reporting silently (or, for
// a startup failure, leaves a windowless zombie process running in the tray).
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception:', err)
})

// clearInvalidConfig makes electron-store reset a corrupted config.json to
// defaults instead of throwing; the try/catch guards any remaining failure
// so a broken store never bricks app startup.
let store: ElectronStore<StoreSchema>
try {
  store = new ElectronStore<StoreSchema>({ defaults, clearInvalidConfig: true }) as ElectronStore<StoreSchema>
} catch (err) {
  console.error('[main] store load failed, falling back to defaults:', err)
  store = new ElectronStore<StoreSchema>({ defaults }) as ElectronStore<StoreSchema>
}
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
  mainWindow = createMainWindow({ store })
  attachCloseHandler(mainWindow)
  // Note: a pending launch file is NOT sent on did-finish-load. At that moment
  // the renderer's bootstrap() is still running and its OPEN_FILE_FROM_OS
  // listener is not registered yet — the message would be silently dropped.
  // Instead the renderer calls api.requestPendingFile() once it is ready, which
  // routes through flushPendingFile() below.

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
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
      return
    }
    // close-to-tray hides instead of destroying, so the hidden window still
    // counts as "existing" — restore it, or clicking the dock icon could
    // never bring the app back (only the tray could).
    const win = getWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })

  app
    .whenReady()
    .then(async () => {
      const initial = extractFileArg(process.argv)
      if (initial) setPending(initial)

      registerAllIpc({ store, getWindow, hasPendingFile, flushPendingFile: () => flushPendingFile(getWindow()) })
      await createWindow()
    })
    .catch((err) => {
      console.error('[main] startup failed:', err)
      void dialog
        .showMessageBox({
          type: 'error',
          title: '启动失败',
          message: `应用启动时出错：${err instanceof Error ? err.message : String(err)}`,
          buttons: ['退出'],
        })
        .then(() => app.quit())
    })
}
