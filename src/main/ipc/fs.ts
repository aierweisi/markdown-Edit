import { ipcMain } from 'electron'
import { promises as fsp, readFileSync, existsSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import {
  CH,
  FileReadReqSchema,
  FileRenameReqSchema,
  FileSaveReqSchema,
  type FileReadResp,
  type FileRenameResp,
  type FileSaveResp,
} from '@shared/ipc'
import { isPathSafe } from '../security/isPathSafe'

export function registerFsIpc(): void {
  ipcMain.handle(CH.FILE_READ, async (_event, filePath: unknown): Promise<FileReadResp> => {
    const parsed = FileReadReqSchema.safeParse(filePath)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const resolved = pathResolve(parsed.data)
    if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }
    try {
      const content = readFileSync(resolved, 'utf-8')
      return { success: true, content }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    CH.FILE_SAVE,
    async (_event, filePath: unknown, content: unknown): Promise<FileSaveResp> => {
      const parsed = FileSaveReqSchema.safeParse({ filePath, content })
      if (!parsed.success) return { success: false, error: 'invalid request' }
      const resolved = pathResolve(parsed.data.filePath)
      if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }
      const tmp = resolved + '.tmp'
      try {
        await fsp.writeFile(tmp, parsed.data.content, 'utf-8')
        await fsp.rename(tmp, resolved)
        return { success: true }
      } catch (err) {
        try {
          await fsp.unlink(tmp)
        } catch {
          /* ignore */
        }
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle(
    CH.FILE_RENAME,
    async (_event, oldPath: unknown, newPath: unknown): Promise<FileRenameResp> => {
      const parsed = FileRenameReqSchema.safeParse({ oldPath, newPath })
      if (!parsed.success) return { success: false, error: 'invalid request' }
      const oldResolved = pathResolve(parsed.data.oldPath)
      const newResolved = pathResolve(parsed.data.newPath)
      if (oldResolved === newResolved) return { success: true, newPath: newResolved }
      if (!isPathSafe(oldResolved) || !isPathSafe(newResolved)) {
        return { success: false, error: 'invalid path' }
      }
      if (existsSync(newResolved)) return { success: false, error: 'target exists' }
      try {
        await fsp.rename(oldResolved, newResolved)
        return { success: true, newPath: newResolved }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )
}
