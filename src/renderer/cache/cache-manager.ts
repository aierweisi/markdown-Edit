import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import type { EditorApi } from '../editor/editor-api'
import type { CacheEntry, TabSnapshot } from '@shared/types'

/** Bump when CacheEntry/TabSnapshot shape changes; old caches are discarded. */
const CACHE_VERSION = 1

/** Total content budget for one snapshot (UTF-16 code units as a proxy).
 *  Beyond it, unmodified file-backed tabs are stored WITHOUT content and
 *  re-read from disk on restore — their disk copy is authoritative anyway.
 *  The active tab and anything with unsaved edits never gets trimmed, so no
 *  unsaved work is ever dropped for the budget's sake. */
const SNAPSHOT_BUDGET = 8 * 1024 * 1024

interface CacheDeps {
  ctx: AppContext
  tabs: TabManager
  editor: EditorApi
  /** File-sync baseline lookup (tabId → last known disk mtime/size), captured
   *  into each snapshot so session restore can detect external changes made
   *  while the app was closed. Optional for tests. */
  diskBaseline?: (tabId: string) => { mtimeMs: number; size: number } | undefined
}

export interface CacheManager {
  start(): void
  stop(): void
  saveAll(): Promise<void>
  markDirty(): void
  loadSnapshot(): Promise<CacheEntry | null>
  applySnapshot(entry: CacheEntry): Promise<void>
}

export function createCacheManager(deps: CacheDeps): CacheManager {
  let timer: ReturnType<typeof setInterval> | null = null
  let unsubSettings: (() => void) | null = null
  let dirty = false
  let persistLock = false

  function buildSnapshot(): CacheEntry {
    const tabs = deps.tabs.getAll()
    const editorContent = deps.editor.getValue()
    const activeId = deps.ctx.store.activeTabId()

    // Budget order: must-keep tabs (active / unsaved / untitled) first, then
    // the rest in recency order; sort is stable so same-rank tabs keep order.
    const rank = (t: { id: string; filePath: string | null; modified: boolean }): number =>
      t.id === activeId || t.modified || !t.filePath ? 1 : 0
    const ordered = [...tabs].sort((a, b) => rank(b) - rank(a))

    let budget = SNAPSHOT_BUDGET
    const snapshots: TabSnapshot[] = ordered.map((t) => {
      const disk = deps.diskBaseline?.(t.id)
      const content = t.id === activeId ? editorContent : deps.tabs.getContent(t.id)
      // For the active tab, always read the live editor content so we don't
      // race with the editor-onChange → tab.setContent debounce.
      const keepContent = rank(t) === 1 || content.length <= budget
      if (keepContent && rank(t) === 0) budget -= content.length
      return {
        id: t.id,
        title: t.title,
        filePath: t.filePath,
        content: keepContent ? content : undefined,
        modified: t.modified,
        scrollTop: t.id === activeId ? deps.editor.getScrollTop() : 0,
        diskMtimeMs: disk?.mtimeMs,
        diskSize: disk?.size,
      }
    })

    return { version: CACHE_VERSION, tabs: snapshots, activeTabId: activeId, savedAt: Date.now() }
  }

  async function saveAll(): Promise<void> {
    if (persistLock) return
    persistLock = true
    try {
      const snapshot = buildSnapshot()
      const result = await deps.ctx.api.storeSet('cache', snapshot)
      // Only clear the dirty flag on a successful write. Clearing it on
      // failure would make the next interval skip the retry, leaving these
      // edits only in memory (lost on crash). Keep dirty to re-attempt.
      if (result.success) dirty = false
      else console.warn('[cache] persist failed:', result.error)
    } finally {
      persistLock = false
    }
  }

  return {
    start() {
      if (timer) return
      const schedule = (): ReturnType<typeof setInterval> => {
        const intervalSec = deps.ctx.store.settings().autoSaveInterval
        return setInterval(() => {
          if (dirty) void saveAll()
        }, intervalSec * 1000)
      }
      timer = schedule()
      // Re-create the interval if the user changes the autosave interval in
      // settings; otherwise the cache timer would keep the old cadence.
      unsubSettings = deps.ctx.store.settings.subscribe(() => {
        if (timer) clearInterval(timer)
        timer = schedule()
      })
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      if (unsubSettings) {
        unsubSettings()
        unsubSettings = null
      }
    },
    saveAll,
    markDirty() {
      dirty = true
    },
    async loadSnapshot() {
      const entry = await deps.ctx.api.storeGet('cache')
      if (
        !entry ||
        entry.version !== CACHE_VERSION ||
        !Array.isArray(entry.tabs) ||
        entry.tabs.length === 0
      )
        return null
      return entry
    },
    async applySnapshot(entry) {
      // Recreate each tab with its persisted id so active-tab matching (and
      // tab order) stays stable across restarts, instead of matching by title.
      for (const snap of entry.tabs) {
        let content = snap.content
        let modified = snap.modified
        if (content === undefined) {
          // Budget-trimmed snapshot of an unmodified file-backed tab — the
          // disk copy is authoritative; re-read it. A vanished file skips the
          // tab rather than restoring an empty shell over it.
          if (!snap.filePath) continue
          const read = await deps.ctx.api.fileRead(snap.filePath)
          if (!read.success) continue
          content = read.content
          modified = false
        }
        const tab = deps.tabs.create({
          id: snap.id,
          title: snap.title,
          filePath: snap.filePath,
          content,
        })
        deps.tabs.markModified(tab.id, modified)
      }
      const all = deps.tabs.getAll()
      const activeMatch = entry.activeTabId ? all.find((t) => t.id === entry.activeTabId) : all[0]
      if (activeMatch) deps.tabs.setActive(activeMatch.id)
    },
  }
}

/**
 * Expose CacheManager.saveAll on window so the main-process close handler can
 * call it via executeJavaScript (kept for compatibility with the existing
 * close-to-tray flow that pre-flushes the cache).
 */
export function exposeForMainProcess(manager: CacheManager): void {
  (window as unknown as { CacheManager?: { saveAll(): Promise<void> } }).CacheManager = {
    saveAll: () => manager.saveAll(),
  }
}
