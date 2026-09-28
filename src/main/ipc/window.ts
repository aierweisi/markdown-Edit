import { BrowserWindow, ipcMain } from 'electron'
import { CH } from '@shared/ipc'

export function registerWindowIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(CH.WIN_MINIMIZE, () => {
    getWindow()?.minimize()
  })

  ipcMain.handle(CH.WIN_TOGGLE_MAXIMIZE, () => {
    const win = getWindow()
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })

  ipcMain.handle(CH.WIN_CLOSE, () => {
    getWindow()?.close()
  })

  ipcMain.handle(CH.WIN_IS_MAXIMIZED, () => getWindow()?.isMaximized() ?? false)

  ipcMain.handle(CH.FOCUS_WINDOW, () => {
    const win = getWindow()
    if (!win) return
    if (process.platform === 'win32') win.blur()
    win.focus()
    win.webContents.focus()
  })
}
