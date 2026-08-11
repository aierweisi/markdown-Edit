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
  /** Call after a successful write (manual save or autosave): stamps the given
   *  post-write mtime/size as the baseline SYNCHRONOUSLY. Taking the values
   *  straight from the save result (instead of re-stat'ing) removes the window
   *  in which a focus-triggered check could compare a stale baseline against
   *  the just-written file and false-fire "外部已更新". */
  noteSaved(tabId: string, mtimeMs: number, size: number): void
  /** Stat the active tab's file and reload/prompt if it changed on disk.
   *  Pull-based — no background watcher. Safe to call any time. */
  checkActiveTab(): Promise<void>
  dispose(): void
}

/**
 * Detects external file changes lazily: only when a tab is activated (opened or
 * switched to) do we stat its file and compare mtime/size against the last-known
 * baseline. Replaces an earlier fs.watch push model, which produced false
 * positives on Windows (spurious native events) and right after autosave wrote
 * the file — both because it reacted to native change events rather than
 * checking on demand.
 *
 * Baselines are refreshed whenever a file is written (noteSaved) and whenever a
 * file-backed tab appears or its path changes; the activation check is the only
 * place that decides "the file changed externally → reload".
 */
export function createFileSync(deps: FileSyncDeps): FileSyncApi {
  const { ctx, tabs } = deps
  // tabId → last known disk mtimeMs/size
  const mtimes = new Map<string, { mtimeMs: number; size: number }>()
  // tabId → filePath we last baselined (detect save-as / external move)
  const knownPaths = new Map<string, string>()
  // tabs whose check is already in flight (avoid re-entrancy on rapid switches)
  const inflight = new Set<string>()

  let disposed = false

  async function recordMtime(tabId: string, filePath: string): Promise<void> {
    const st = await ctx.api.fileStat(filePath)
    if (disposed) return
    if (st.success && st.exists) mtimes.set(tabId, { mtimeMs: st.mtimeMs, size: st.size })
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
        // Keep local edits; refresh the baseline so we don't nag on every activation.
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

  async function checkTab(tab: TabState): Promise<void> {
    if (!tab.filePath) return
    if (inflight.has(tab.id)) return
    inflight.add(tab.id)
    try {
      const st = await ctx.api.fileStat(tab.filePath)
      if (disposed || !st.success) return
      if (!st.exists) {
        mtimes.delete(tab.id)
        showToast(`"${tab.title}" 已被删除`, 'error')
        return
      }
      const last = mtimes.get(tab.id)
      if (!last) {
        // No baseline yet (recordMtime is async and may not have landed). Stamp
        // it from the current stat and skip — avoids a false reload right after
        // open. The next real activation still catches external changes.
        mtimes.set(tab.id, { mtimeMs: st.mtimeMs, size: st.size })
        return
      }
      if (last.mtimeMs === st.mtimeMs && last.size === st.size) return // spurious
      mtimes.set(tab.id, { mtimeMs: st.mtimeMs, size: st.size })
      await handleChange(tab)
    } finally {
      inflight.delete(tab.id)
    }
  }

  async function checkActiveTab(): Promise<void> {
    if (disposed) return
    const tab = tabs.getActive()
    if (!tab?.filePath) return
    await checkTab(tab)
  }

  // Keep baselines fresh for every file-backed tab: record on first appearance,
  // re-record when its path changes (save-as / external move), and drop entries
  // for closed tabs. Covers open, drag-drop, OS-association and cache-restore.
  const unsubTabs = ctx.store.tabs.subscribe((next) => {
    const live = new Set<string>()
    for (const t of next) {
      if (!t.filePath) continue
      live.add(t.id)
      if (knownPaths.get(t.id) !== t.filePath) {
        knownPaths.set(t.id, t.filePath)
        void recordMtime(t.id, t.filePath)
      }
    }
    for (const id of knownPaths.keys()) {
      if (!live.has(id)) {
        knownPaths.delete(id)
        mtimes.delete(id)
      }
    }
  })
  // The one place we actually decide to reload: when the user activates a tab.
  const unsubActive = ctx.store.activeTabId.subscribe(() => void checkActiveTab())

  return {
    noteSaved(tabId, mtimeMs, size) {
      mtimes.set(tabId, { mtimeMs, size })
      const t = tabs.getById(tabId)
      if (t?.filePath) knownPaths.set(tabId, t.filePath)
    },
    checkActiveTab,
    dispose() {
      disposed = true
      unsubTabs()
      unsubActive()
      mtimes.clear()
      knownPaths.clear()
    },
  }
}
