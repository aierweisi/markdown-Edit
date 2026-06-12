import { ipcMain, shell } from 'electron'
import { resolve as pathResolve } from 'node:path'
import { existsSync } from 'node:fs'
import { CH, ShellShowItemReqSchema, type Result } from '@shared/ipc'
import { isPathSafe } from '../security/isPathSafe'

export function registerShellIpc(): void {
  ipcMain.handle(CH.SHELL_SHOW_ITEM, (_event, raw: unknown): Result => {
    const parsed = ShellShowItemReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const resolved = pathResolve(parsed.data)
    if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }
    if (!existsSync(resolved)) return { success: false, error: 'not found' }
    shell.showItemInFolder(resolved)
    return { success: true }
  })
}
