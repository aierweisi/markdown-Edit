import { ipcMain } from 'electron'
import { readdirSync, statSync, realpathSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'node:fs'
import { readdir, stat, readFile, realpath } from 'node:fs/promises'
import { join, basename, extname, resolve as pathResolve } from 'node:path'
import type Store from 'electron-store'
import {
  CH,
  DirListReqSchema,
  FileCreateReqSchema,
  FileDeleteReqSchema,
  FileStatReqSchema,
  ResolveWikiReqSchema,
  WorkspaceSearchReqSchema,
  type Result,
  type StoreSchema,
  type WorkspaceListResp,
  type WorkspaceListAllResp,
  type WorkspaceResolveResp,
  type WorkspaceSearchResp,
  type WorkspaceBacklinksResp,
} from '@shared/ipc'
import type { DirEntry, SearchHit } from '@shared/types'
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

  ipcMain.handle(CH.WORKSPACE_SEARCH, async (_e, raw: unknown): Promise<WorkspaceSearchResp> => {
    const parsed = WorkspaceSearchReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const r = root()
    if (!r) return { success: false, error: 'no workspace' }
    return searchWorkspace(r, parsed.data.query)
  })

  ipcMain.handle(CH.WORKSPACE_LIST_ALL, async (): Promise<WorkspaceListAllResp> => {
    const r = root()
    if (!r) return { success: false, error: 'no workspace' }
    const files: string[] = []
    let truncated = false
    for await (const full of iterMarkdownFiles(r)) {
      if (files.length >= MAX_LIST_ALL_FILES) {
        truncated = true
        break
      }
      files.push(full)
    }
    return { success: true, root: r, files, truncated }
  })

  ipcMain.handle(CH.WORKSPACE_BACKLINKS, async (_e, raw: unknown): Promise<WorkspaceBacklinksResp> => {
    const parsed = FileStatReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const r = root()
    if (!r) return { success: false, error: 'no workspace' }
    const resolved = pathResolve(parsed.data)
    if (!isPathSafe(resolved, r)) return { success: false, error: 'out of workspace' }
    return collectBacklinks(r, resolved)
  })
}

/** Which workspace files link TO `targetPath` via [[wiki]] links. Matching
 *  mirrors findByName semantics: the link target equals the file's basename
 *  without extension, case-insensitively. */
const WIKI_LINK_RE = /\[\[([^\]\n]+)\]\]/g
const MAX_BACKLINKS = 200

async function collectBacklinks(rootDir: string, targetPath: string): Promise<WorkspaceBacklinksResp> {
  const target = basename(targetPath, extname(targetPath)).toLowerCase()
  const hits: SearchHit[] = []
  for await (const full of iterMarkdownFiles(rootDir)) {
    if (full === targetPath) continue
    let text: string
    try {
      text = await readFile(full, 'utf-8')
    } catch {
      continue
    }
    let lineStart = 0
    let lineNum = 1
    for (let i = 0; i <= text.length; i++) {
      if (i === text.length || text[i] === '\n') {
        const line = text.slice(lineStart, i)
        WIKI_LINK_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = WIKI_LINK_RE.exec(line))) {
          const linkTarget = (m[1].split('|')[0] ?? '').trim().toLowerCase()
          if (linkTarget === target) {
            hits.push({ path: full, line: lineNum, text: line.trim().slice(0, MAX_LINE_LEN) })
            if (hits.length >= MAX_BACKLINKS) return { success: true, hits }
            break // one hit per line suffices
          }
        }
        lineStart = i + 1
        lineNum++
      }
    }
  }
  return { success: true, hits }
}

/** Shared async walk of workspace markdown files: symlink-cycle-safe (realpath
 *  dedup), skips dotfiles and IGNORED dirs, never blocks the sync IPC surface. */
async function* iterMarkdownFiles(rootDir: string): AsyncGenerator<string> {
  const visited = new Set<string>()
  const queue: string[] = [rootDir]
  while (queue.length > 0) {
    const dir = queue.shift()!
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      continue
    }
    for (const n of names) {
      if (n.startsWith('.') || IGNORED.has(n)) continue
      const full = join(dir, n)
      let isDir: boolean
      try {
        isDir = (await stat(full)).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        let real: string
        try {
          real = await realpath(full)
        } catch {
          continue
        }
        if (visited.has(real)) continue
        visited.add(real)
        queue.push(full)
        continue
      }
      if (isMarkdown(n)) yield full
    }
  }
}

// ── Full-text search ────────────────────────────────────────────────────
// Async (never blocks the main process's sync IPC surface), symlink-cycle
// safe via the shared iterator, and capped so a huge workspace can't produce
// an unbounded response.
const MAX_SEARCH_FILES = 2000
const MAX_SEARCH_HITS = 500
const MAX_LINE_LEN = 200
const MAX_LIST_ALL_FILES = 5000

async function searchWorkspace(rootDir: string, query: string): Promise<WorkspaceSearchResp> {
  const needle = query.toLowerCase()
  const hits: SearchHit[] = []
  let truncated = false
  let files = 0

  for await (const full of iterMarkdownFiles(rootDir)) {
    files++
    if (files > MAX_SEARCH_FILES) {
      truncated = true
      break
    }
    let text: string
    try {
      text = await readFile(full, 'utf-8')
    } catch {
      continue
    }
    let lineStart = 0
    let lineNum = 1
    for (let i = 0; i <= text.length; i++) {
      if (i === text.length || text[i] === '\n') {
        const line = text.slice(lineStart, i)
        if (line.toLowerCase().includes(needle)) {
          hits.push({
            path: full,
            line: lineNum,
            text: line.length > MAX_LINE_LEN ? line.slice(0, MAX_LINE_LEN) + '…' : line,
          })
          if (hits.length >= MAX_SEARCH_HITS) return { success: true, hits, truncated: true }
        }
        lineStart = i + 1
        lineNum++
      }
    }
  }
  return { success: true, hits, truncated }
}

/** Depth-first search for the first markdown file whose basename matches `name`.
 *  `statSync` follows symlinks, so a symlink cycle inside the workspace would
 *  otherwise loop forever and hang the main process (all IPC). Each directory
 *  is canonicalized with realpath and tracked in a visited set; depth and total
 *  directory caps bound pathological trees. */
const MAX_WIKI_RESOLVE_DEPTH = 24
const MAX_WIKI_RESOLVE_DIRS = 10_000

function findByName(rootDir: string, name: string): string | null {
  const target = name.toLowerCase()
  const visited = new Set<string>()
  const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]
  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!
    if (depth >= MAX_WIKI_RESOLVE_DEPTH) continue
    let real: string
    try {
      real = realpathSync(dir)
    } catch {
      continue
    }
    if (visited.has(real)) continue
    if (visited.size >= MAX_WIKI_RESOLVE_DIRS) return null
    visited.add(real)
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
        stack.push({ dir: full, depth: depth + 1 })
        continue
      }
      if (isMarkdown(n) && basename(n, extname(n)).toLowerCase() === target) return full
    }
  }
  return null
}
