import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import type { EditorApi } from '../editor/editor-api'
import type { TabState } from '../state/app-store'
import { showConfirm } from '../ui/confirm-modal'
import { showToast } from '../ui/toast'

interface FileSyncDeps {
  ctx: AppContext
  tabs: TabManager
  editor: EditorApi
  /** Reload `tab` with fresh `content` (update memory + editor/preview/etc.). */
  reloadTab(tab: TabState, content: string): void
}

export interface FileSyncApi {
  /** Call after a successful save: absorbs the watcher event our own write
   *  triggers (1s grace) and refreshes the mtime baseline. */
  noteSaved(tabId: string): Promise<void>
  dispose(): void
}

const SAVING_GRACE_MS = 1000

/**
 * Keeps open files in sync with the disk: the main process watches each file
 * (see src/main/file-watcher.ts) and pushes FILE_CHANGED events; here we compare
 * mtime/size against the last-known baseline and reload — automatically when the
 * tab is clean, via a confirm dialog when it has unsaved edits (never silent
 * overwrite). Owns its own watcher add/remove by reconciling against the tabs.
 */
export function createFileSync(deps: FileSyncDeps): FileSyncApi {
  const { ctx, tabs } = deps
  // tabId → last known disk mtimeMs/size
  const mtimes = new Map<string, { mtimeMs: number; size: number }>()
  // tabId inside a "just saved" grace window — skip reload, only refresh baseline
  const savingGrace = new Map<string, number>()
  // filePath → tabId we asked the main process to watch
  const watchedPaths = new Map<string, string>()
  // paths whose change-handling is already in flight (avoid re-entrancy)
  const inflight = new Set<string>()

  let disposed = false

  async function recordMtime(tabId: string, filePath: string): Promise<void> {
    const st = await ctx.api.fileStat(filePath)
    if (disposed) return
    if (st.success && st.exists) mtimes.set(tabId, { mtimeMs: st.mtimeMs, size: st.size })
  }

  function reconcile(): void {
    const wantPath = new Map<string, string>()
    for (const t of tabs.getAll()) if (t.filePath) wantPath.set(t.filePath, t.id)

    // add newly-wanted paths
    for (const [path, tabId] of wantPath) {
      if (watchedPaths.has(path)) continue
      watchedPaths.set(path, tabId)
      void ctx.api.fileWatch(path)
      void recordMtime(tabId, path)
    }
    // remove no-longer-wanted paths (tab closed or saved-as to a new path)
    const stale: string[] = []
    for (const path of watchedPaths.keys()) if (!wantPath.has(path)) stale.push(path)
    for (const path of stale) {
      const tabId = watchedPaths.get(path)
      watchedPaths.delete(path)
      void ctx.api.fileUnwatch(path)
      if (tabId) mtimes.delete(tabId)
    }
  }

  async function reload(tab: TabState): Promise<void> {
    const read = await ctx.api.fileRead(tab.filePath!)
    if (disposed) return
    if (!read.success) {
      showToast(`重新加载失败: ${read.error}`, 'error')
      return
    }
    deps.reloadTab(tab, read.content)
    tabs.markModified(tab.id, false)
  }

  async function handleChange(tab: TabState): Promise<void> {
    if (tab.modified) {
      const ok = await showConfirm({
        title: '文件已在外部修改',
        message: `"${tab.title}" 已被其它程序修改，重新加载会丢失当前未保存的修改。`,
        okText: '重新加载',
        cancelText: '保留我的',
        danger: true,
      })
      if (disposed) return
      if (!ok) {
        // Keep local edits; refresh the baseline so we don't nag repeatedly.
        await recordMtime(tab.id, tab.filePath!)
        return
      }
      await reload(tab)
      showToast(`"${tab.title}" 已重新加载`, 'info')
    } else {
      await reload(tab)
      showToast(`"${tab.title}" 已在外部更新`, 'info')
    }
  }

  async function onFileChanged(payload: { path: string; event: string }): Promise<void> {
    if (disposed) return
    const path = payload.path
    if (inflight.has(path)) return
    const tabId = watchedPaths.get(path)
    if (!tabId) return
    const tab = tabs.getById(tabId)
    if (!tab?.filePath) return

    inflight.add(path)
    try {
      // our own save: only refresh the baseline, never reload
      const grace = savingGrace.get(tabId)
      if (grace && Date.now() < grace) {
        savingGrace.delete(tabId)
        await recordMtime(tabId, path)
        return
      }
      savingGrace.delete(tabId)

      const st = await ctx.api.fileStat(path)
      if (disposed || !st.success) return
      if (!st.exists) {
        watchedPaths.delete(path)
        void ctx.api.fileUnwatch(path)
        mtimes.delete(tabId)
        showToast(`"${tab.title}" 已被删除`, 'error')
        return
      }
      const last = mtimes.get(tabId)
      if (!last) {
        // Tab just opened; baseline not recorded yet (reconcile's recordMtime is
        // async). Stamp it and skip — avoids a false reload on the first watch
        // flutter right after open. The next real change still reloads.
        await recordMtime(tabId, path)
        return
      }
      if (last.mtimeMs === st.mtimeMs && last.size === st.size) return // spurious
      mtimes.set(tabId, { mtimeMs: st.mtimeMs, size: st.size })
      await handleChange(tab)
    } finally {
      inflight.delete(path)
    }
  }

  const unsubTabs = ctx.store.tabs.subscribe(reconcile)
  const unsubEvent = ctx.api.onFileChanged((p) => void onFileChanged(p))
  reconcile() // pick up tabs already open before we attached

  return {
    async noteSaved(tabId) {
      savingGrace.set(tabId, Date.now() + SAVING_GRACE_MS)
      const t = tabs.getById(tabId)
      if (t?.filePath) await recordMtime(tabId, t.filePath)
    },
    dispose() {
      disposed = true
      unsubTabs()
      unsubEvent()
      for (const path of watchedPaths.keys()) void ctx.api.fileUnwatch(path)
      watchedPaths.clear()
      mtimes.clear()
    },
  }
}
