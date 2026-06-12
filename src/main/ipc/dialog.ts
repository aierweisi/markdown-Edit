import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { CH, SaveDialogOptsSchema, type DialogOpenResult, type DialogSaveResult } from '@shared/ipc'
import { MD_EXTENSIONS } from '@shared/paths'

const MD_FILTER = { name: 'Markdown', extensions: [...MD_EXTENSIONS] }
const ALL_FILTER = { name: '所有文件', extensions: ['*'] }

export function registerDialogIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(CH.DIALOG_OPEN_FILE, async (): Promise<DialogOpenResult> => {
    const win = getWindow()
    if (!win) return { canceled: true, filePaths: [] }
    return dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [MD_FILTER, ALL_FILTER],
    })
  })

  ipcMain.handle(CH.DIALOG_SAVE_FILE, async (_event, opts: unknown): Promise<DialogSaveResult> => {
    const parsed = SaveDialogOptsSchema.safeParse(opts ?? {})
    if (!parsed.success) return { canceled: true }
    const win = getWindow()
    if (!win) return { canceled: true }
    const defaultName = parsed.data.defaultPath ?? ''
    const defaultPath =
      defaultName.includes('/') || defaultName.includes('\\')
        ? defaultName
        : join(app.getPath('documents'), defaultName)
    return dialog.showSaveDialog(win, {
      defaultPath,
      filters: parsed.data.filters ?? [{ name: 'Markdown', extensions: ['md'] }],
    })
  })

  ipcMain.handle(CH.DIALOG_SELECT_DIR, async (): Promise<DialogOpenResult> => {
    const win = getWindow()
    if (!win) return { canceled: true, filePaths: [] }
    return dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    })
  })
}
