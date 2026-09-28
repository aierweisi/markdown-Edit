import { ipcMain } from 'electron'
import { promises as fsp, readFileSync, existsSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import {
  CH,
  FileReadReqSchema,
  FileRenameReqSchema,
  FileSaveReqSchema,
  FileStatReqSchema,
  type FileReadResp,
  type FileRenameResp,
  type FileSaveResp,
  type FileStatResp,
} from '@shared/ipc'
import { isPathSafe } from '../security/isPathSafe'
import { archivePreviousVersion } from '../history'

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
      // Stat alongside the read so callers can prime a baseline without a
      // second round-trip — closes the window where file-sync's async
      // recordMtime hadn't landed yet and a checkTab mistook the post-open
      // disk state for "no change", silently swallowing an external edit.
      const st = await fsp.stat(resolved)
      return { success: true, content, mtimeMs: st.mtimeMs, size: st.size }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    CH.FILE_SAVE,
    async (_event, filePath: unknown, content: unknown, create: unknown): Promise<FileSaveResp> => {
      const parsed = FileSaveReqSchema.safeParse({ filePath, content, create })
      if (!parsed.success) return { success: false, error: 'invalid request' }
      const resolved = pathResolve(parsed.data.filePath)
      if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }
      try {
        if (!parsed.data.create) {
          // Refuse to resurrect a vanished path (externally moved/deleted/
          // renamed): writing back would silently re-create the file at the
          // old location. Callers pass create:true for genuinely new files
          // (save-as, exports). Single stat here is both the existence check
          // and the TOCTOU-hardened alternative to renderer-side stat+save.
          try {
            await fsp.stat(resolved)
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              return { success: false, error: '文件已被移动或删除', moved: true }
            }
            throw err
          }
        }
        // Archive the on-disk version before it is overwritten (local history;
        // throttled + content-deduped inside, best-effort — never blocks save).
        await archivePreviousVersion(resolved)
        // Overwrite in place instead of write-temp + rename. A same-directory
        // temp file (xxx.md.tmp) surfaces a "new file" shell notification on
        // shell folders (e.g. Desktop); with auto-arrange on, that snaps the
        // user's icon back to its original slot on every save. Overwriting keeps
        // the file present the whole time so the desktop never refreshes.
        // Trade-off: no atomic replace (a crash mid-write can corrupt the file)
        // — acceptable for small md notes, and the renderer keeps a cache
        // snapshot as a backstop.
        await fsp.writeFile(resolved, parsed.data.content, 'utf-8')
        // Post-write mtime/size lets the renderer refresh its file-sync baseline
        // without a second stat round-trip.
        const st = await fsp.stat(resolved)
        return { success: true, mtimeMs: st.mtimeMs, size: st.size }
      } catch (err) {
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
}
