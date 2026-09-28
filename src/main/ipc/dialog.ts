import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import type Store from 'electron-store'
import { CH, SaveDialogOptsSchema, type DialogOpenResult, type DialogSaveResult, type StoreSchema } from '@shared/ipc'
import { MD_EXTENSIONS } from '@shared/paths'

const MD_FILTER = { name: 'Markdown', extensions: [...MD_EXTENSIONS] }
const ALL_FILTER = { name: '所有文件', extensions: ['*'] }

export function registerDialogIpc(getWindow: () => BrowserWindow | null, store: Store<StoreSchema>): void {
  // Start open/browse dialogs in the current workspace when one is open —
  // otherwise the OS picks a generic location unrelated to the user's notes.
  const workspaceDir = (): string | undefined => store.get('workspacePath') ?? undefined

  ipcMain.handle(CH.DIALOG_OPEN_FILE, async (): Promise<DialogOpenResult> => {
    const win = getWindow()
    if (!win) return { canceled: true, filePaths: [] }
    return dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [MD_FILTER, ALL_FILTER],
      defaultPath: workspaceDir(),
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
      defaultPath: workspaceDir(),
    })
  })
}
