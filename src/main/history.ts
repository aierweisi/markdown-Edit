import { app, ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolve as pathResolve } from 'node:path'
import {
  CH,
  FileStatReqSchema,
  HistoryReadReqSchema,
  type HistoryListResp,
  type HistoryReadResp,
} from '@shared/ipc'
import { isPathSafe } from './security/isPathSafe'

/**
 * Local file history: every in-place overwrite archives the previous on-disk
 * version first (userData/history/<path-hash>/<mtime-ms>.md). Throttled and
 * content-deduped so autosave's ~10s cadence doesn't churn the archive —
 * versions are meaningful snapshots, not keystroke backups (crash recovery
 * for the last minutes is the cache snapshot's job, not this one).
 */
const KEEP_PER_FILE = 30
const ARCHIVE_COOLDOWN_MS = 5 * 60 * 1000
const lastArchiveAt = new Map<string, number>()
const lastArchiveHash = new Map<string, string>()

function historyDirFor(filePath: string): string {
  const key = createHash('sha1').update(filePath.replace(/\\/g, '/').toLowerCase()).digest('hex').slice(0, 20)
  return join(app.getPath('userData'), 'history', key)
}

/** Archive the current on-disk content of `filePath` before it is overwritten.
 *  Best-effort: any failure is swallowed — history must never break a save. */
export async function archivePreviousVersion(filePath: string): Promise<void> {
  try {
    const prev = await readFile(filePath, 'utf-8').catch(() => null)
    if (prev === null) return // nothing on disk to archive
    const now = Date.now()
    if (now - (lastArchiveAt.get(filePath) ?? 0) < ARCHIVE_COOLDOWN_MS) return
    const hash = createHash('sha1').update(prev).digest('hex')
    if (lastArchiveHash.get(filePath) === hash) return
    const st = await stat(filePath)
    const dir = historyDirFor(filePath)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${Math.round(st.mtimeMs)}.md`), prev, 'utf-8')
    lastArchiveAt.set(filePath, now)
    lastArchiveHash.set(filePath, hash)
    await prune(dir)
  } catch {
    /* best effort */
  }
}

async function prune(dir: string): Promise<void> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => /^\d+\.md$/.test(n)).sort()
  const excess = names.slice(0, Math.max(0, names.length - KEEP_PER_FILE))
  for (const name of excess) await rm(join(dir, name), { force: true })
}

async function listVersions(filePath: string): Promise<Array<{ ts: number; size: number }>> {
  const dir = historyDirFor(filePath)
  const names = await readdir(dir).catch(() => [] as string[])
  const out: Array<{ ts: number; size: number }> = []
  for (const n of names) {
    const m = n.match(/^(\d{10,})\.md$/)
    if (!m) continue
    const st = await stat(join(dir, n)).catch(() => null)
    if (st) out.push({ ts: Number(m[1]), size: st.size })
  }
  return out.sort((a, b) => b.ts - a.ts)
}

async function readVersion(filePath: string, ts: number): Promise<string | null> {
  const dir = historyDirFor(filePath)
  const names = await readdir(dir).catch(() => [] as string[])
  const target = `${ts}.md`
  if (!names.includes(target)) return null
  return readFile(join(dir, target), 'utf-8')
}

export function registerHistoryIpc(): void {
  ipcMain.handle(CH.HISTORY_LIST, async (_e, raw: unknown): Promise<HistoryListResp> => {
    const parsed = FileStatReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const resolved = pathResolve(parsed.data)
    if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }
    try {
      return { success: true, versions: await listVersions(resolved) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(CH.HISTORY_READ, async (_e, raw: unknown): Promise<HistoryReadResp> => {
    const parsed = HistoryReadReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const resolved = pathResolve(parsed.data.filePath)
    if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }
    const content = await readVersion(resolved, parsed.data.ts).catch(() => null)
    if (content === null) return { success: false, error: 'version not found' }
    return { success: true, content }
  })
}
