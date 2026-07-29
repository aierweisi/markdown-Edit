import { ipcMain } from 'electron'
import { readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import type Store from 'electron-store'
import {
  CH,
  DirListReqSchema,
  FileCreateReqSchema,
  FileDeleteReqSchema,
  ResolveWikiReqSchema,
  type Result,
  type StoreSchema,
  type WorkspaceListResp,
  type WorkspaceResolveResp,
} from '@shared/ipc'
import type { DirEntry } from '@shared/types'
import { isPathSafe } from '../security/isPathSafe'
import { MD_EXTENSIONS } from '@shared/paths'

const IGNORED = new Set(['node_modules', '.git', 'dist', 'out', 'release', '.cache'])

function isMarkdown(name: string): boolean {
  return (MD_EXTENSIONS as readonly string[]).includes(extname(name).slice(1))
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerWorkspaceIpc(store: Store<StoreSchema>): void {
  const root = (): string | null => store.get('workspacePath') ?? null

  ipcMain.handle(CH.WORKSPACE_LIST, (_e, raw: unknown): WorkspaceListResp => {
    const parsed = DirListReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const dir = parsed.data
    const r = root()
    if (!r || !isPathSafe(dir, r)) return { success: false, error: 'out of workspace' }
    try {
      const entries: DirEntry[] = []
      for (const name of readdirSync(dir)) {
        if (name.startsWith('.') || IGNORED.has(name)) continue
        const full = join(dir, name)
        let isDir: boolean
        try {
          isDir = statSync(full).isDirectory()
        } catch {
          continue
        }
        if (!isDir && !isMarkdown(name)) continue
        entries.push({ name, path: full, isDir })
      }
      entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      return { success: true, entries }
    } catch (err) {
      return { success: false, error: errMsg(err) }
    }
  })

  ipcMain.handle(CH.FILE_CREATE, (_e, path: unknown, isDir: unknown): Result => {
    const parsed = FileCreateReqSchema.safeParse({ path, isDir })
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const r = root()
    if (!r || !isPathSafe(parsed.data.path, r)) return { success: false, error: 'out of workspace' }
    try {
      if (parsed.data.isDir) mkdirSync(parsed.data.path)
      else writeFileSync(parsed.data.path, '', 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: errMsg(err) }
    }
  })

  ipcMain.handle(CH.FILE_DELETE, (_e, path: unknown, isDir: unknown): Result => {
    const parsed = FileDeleteReqSchema.safeParse({ path, isDir })
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const r = root()
    if (!r || !isPathSafe(parsed.data.path, r)) return { success: false, error: 'out of workspace' }
    try {
      if (parsed.data.isDir) rmSync(parsed.data.path, { recursive: true, force: true })
      else unlinkSync(parsed.data.path)
      return { success: true }
    } catch (err) {
      return { success: false, error: errMsg(err) }
    }
  })

  ipcMain.handle(CH.WORKSPACE_RESOLVE_WIKI, (_e, raw: unknown): WorkspaceResolveResp => {
    const parsed = ResolveWikiReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const r = root()
    if (!r) return { success: false, error: 'no workspace' }
    const found = findByName(r, parsed.data)
    return found ? { success: true, path: found } : { success: false, error: 'not found' }
  })
}

/** Depth-first search for the first markdown file whose basename matches `name`. */
function findByName(rootDir: string, name: string): string | null {
  const target = name.toLowerCase()
  const stack = [rootDir]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const n of names) {
      if (n.startsWith('.') || IGNORED.has(n)) continue
      const full = join(dir, n)
      let isDir: boolean
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        stack.push(full)
        continue
      }
      if (isMarkdown(n) && basename(n, extname(n)).toLowerCase() === target) return full
    }
  }
  return null
}
