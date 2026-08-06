import { ipcMain } from 'electron'
import { promises as fsp, readFileSync, existsSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import {
  CH,
  type Result,
  FileReadReqSchema,
  FileRenameReqSchema,
  FileSaveReqSchema,
  FileStatReqSchema,
  FileUnwatchReqSchema,
  FileWatchReqSchema,
  type FileReadResp,
  type FileRenameResp,
  type FileSaveResp,
  type FileStatResp,
} from '@shared/ipc'
import { isPathSafe } from '../security/isPathSafe'
import { bindWebContents, watchFile, unwatchFile } from '../file-watcher'

export function registerFsIpc(): void {
  ipcMain.handle(CH.FILE_READ, async (_event, filePath: unknown): Promise<FileReadResp> => {
    const parsed = FileReadReqSchema.safeParse(filePath)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const resolved = pathResolve(parsed.data)
    if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }
    try {
      const raw = readFileSync(resolved, 'utf-8')
      // Strip a leading UTF-8 BOM if present, otherwise it becomes the first char.
      const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
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
      if (!isPathSafe(oldResolved) || !isPathSafe(newResolved)) {
        return { success: false, error: 'invalid path' }
      }
      if (oldResolved === newResolved) return { success: true, newPath: newResolved }
      if (existsSync(newResolved)) return { success: false, error: 'target exists' }
      try {
        await fsp.rename(oldResolved, newResolved)
        return { success: true, newPath: newResolved }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle(CH.FILE_STAT, async (_event, filePath: unknown): Promise<FileStatResp> => {
    const parsed = FileStatReqSchema.safeParse(filePath)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const resolved = pathResolve(parsed.data)
    if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }
    try {
      const st = await fsp.stat(resolved)
      return { success: true, exists: true, mtimeMs: st.mtimeMs, size: st.size }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: true, exists: false, mtimeMs: 0, size: 0 }
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(CH.FILE_WATCH, (event, filePath: unknown): Result => {
    const parsed = FileWatchReqSchema.safeParse(filePath)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    bindWebContents(event.sender)
    return watchFile(parsed.data) ? { success: true } : { success: false, error: 'watch failed' }
  })

  ipcMain.handle(CH.FILE_UNWATCH, (_event, filePath: unknown): Result => {
    const parsed = FileUnwatchReqSchema.safeParse(filePath)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    unwatchFile(parsed.data)
    return { success: true }
  })
}
