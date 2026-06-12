import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import type { EditorApi } from '../editor/editor-api'
import type { CacheEntry, TabSnapshot } from '@shared/types'

interface CacheDeps {
  ctx: AppContext
  tabs: TabManager
  editor: EditorApi
}

export interface CacheManager {
  start(): void
  stop(): void
  saveAll(): Promise<void>
  markDirty(): void
  loadSnapshot(): Promise<CacheEntry | null>
  applySnapshot(entry: CacheEntry): void
}

export function createCacheManager(deps: CacheDeps): CacheManager {
  let timer: ReturnType<typeof setInterval> | null = null
  let dirty = false
  let persistLock = false

  function buildSnapshot(): CacheEntry {
    const tabs = deps.tabs.getAll()
    const editorContent = deps.editor.getValue()
    const activeId = deps.ctx.store.activeTabId()

    const snapshots: TabSnapshot[] = tabs.map((t) => ({
      id: t.id,
      title: t.title,
      filePath: t.filePath,
      // For the active tab, always read the live editor content so we don't
      // race with the editor-onChange → tab.setContent debounce.
      content: t.id === activeId ? editorContent : deps.tabs.getContent(t.id),
      modified: t.modified,
      scrollTop: t.id === activeId ? deps.editor.getScrollTop() : 0,
    }))

    return { tabs: snapshots, activeTabId: activeId, savedAt: Date.now() }
  }

  async function saveAll(): Promise<void> {
    if (persistLock) return
    persistLock = true
    try {
      const snapshot = buildSnapshot()
      const result = await deps.ctx.api.storeSet('cache', snapshot)
      if (!result.success) console.warn('[cache] persist failed:', result.error)
      dirty = false
    } finally {
      persistLock = false
    }
  }

  return {
    start() {
      if (timer) return
      const intervalSec = deps.ctx.store.settings().autoSaveInterval
      timer = setInterval(() => {
        if (dirty) void saveAll()
      }, intervalSec * 1000)
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    saveAll,
    markDirty() {
      dirty = true
    },
    async loadSnapshot() {
      const entry = await deps.ctx.api.storeGet('cache')
      if (!entry || !Array.isArray(entry.tabs) || entry.tabs.length === 0) return null
      return entry
    },
    applySnapshot(entry) {
      // Tab manager creates each tab, then we restore content and active id.
      for (const snap of entry.tabs) {
        const tab = deps.tabs.create({
          title: snap.title,
          filePath: snap.filePath,
          content: snap.content,
        })
        deps.tabs.markModified(tab.id, snap.modified)
        // Match the persisted id back into the new tab so tabOrder stays stable.
        // Rather than mutating private ids, we accept the new id; the user-visible
        // tabOrder persistence will reset on next change.
      }
      const first = deps.tabs.getAll()[0]
      const activeMatch = entry.activeTabId
        ? deps.tabs.getAll().find((t) => t.title === entry.tabs.find((s) => s.id === entry.activeTabId)?.title)
        : first
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
  ;(window as unknown as { CacheManager?: { saveAll(): Promise<void> } }).CacheManager = {
    saveAll: () => manager.saveAll(),
  }
}
