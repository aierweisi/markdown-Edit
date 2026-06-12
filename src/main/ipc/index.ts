import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import type { StoreSchema } from '@shared/ipc'
import { registerStoreIpc } from './store'
import { registerFsIpc } from './fs'
import { registerImageIpc } from './image'
import { registerDialogIpc } from './dialog'
import { registerExportIpc } from './export'
import { registerShellIpc } from './shell'
import { registerWindowIpc } from './window'
import { registerSystemIpc } from './system'

export interface IpcContext {
  store: Store<StoreSchema>
  getWindow(): BrowserWindow | null
  hasPendingFile(): boolean
}

export function registerAllIpc(ctx: IpcContext): void {
  registerStoreIpc(ctx.store)
  registerFsIpc()
  registerImageIpc()
  registerDialogIpc(ctx.getWindow)
  registerExportIpc(ctx.getWindow)
  registerShellIpc()
  registerWindowIpc(ctx.getWindow)
  registerSystemIpc(ctx.hasPendingFile)
}
