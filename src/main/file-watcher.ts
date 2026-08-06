import { watch, type FSWatcher } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import type { WebContents } from 'electron'
import { EV, type FileChangedEvent } from '@shared/ipc'
import { isPathSafe } from './security/isPathSafe'

type WatchEventType = FileChangedEvent['event']

interface WatchEntry {
  watcher: FSWatcher
  timer: NodeJS.Timeout | null
  pending: WatchEventType | null
  refs: number
}

// Single-window app: one renderer to push FILE_CHANGED events to.
let activeWc: WebContents | null = null
const watchers = new Map<string, WatchEntry>()
const DEBOUNCE_MS = 250

function emit(resolved: string, event: WatchEventType): void {
  if (!activeWc || activeWc.isDestroyed()) return
  activeWc.send(EV.FILE_CHANGED, { path: resolved, event })
}

function scheduleEmit(entry: WatchEntry, resolved: string, event: WatchEventType): void {
  // 'rename'/'error' outrank 'change' (they usually mean the watcher is about
  // to die) — don't let a trailing 'change' downgrade a queued 'rename'.
  if (entry.pending === null || event !== 'change') entry.pending = event
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    entry.timer = null
    const ev = entry.pending ?? 'change'
    entry.pending = null
    emit(resolved, ev)
  }, DEBOUNCE_MS)
}

/** Re-create the watcher after a rename/error (atomic-write, delete…). If the
 *  file is gone, creation throws and the entry is dropped — the renderer then
 *  learns the file was deleted via the FILE_CHANGED event + its own stat. */
function rewatch(resolved: string): void {
  const entry = watchers.get(resolved)
  if (!entry) return
  try {
    entry.watcher.close()
  } catch {
    /* ignore */
  }
  try {
    entry.watcher = createWatcher(resolved)
  } catch {
    if (entry.timer) clearTimeout(entry.timer)
    watchers.delete(resolved)
  }
}

function createWatcher(resolved: string): FSWatcher {
  const w = watch(resolved, (eventType) => {
    const entry = watchers.get(resolved)
    if (!entry) return
    const ev: WatchEventType = eventType === 'rename' ? 'rename' : 'change'
    scheduleEmit(entry, resolved, ev)
    if (ev === 'rename') {
      // The old watcher is usually dead after a rename; rebuild it shortly.
      setTimeout(() => rewatch(resolved), 60)
    }
  })
  w.on('error', () => {
    const entry = watchers.get(resolved)
    if (!entry) return
    scheduleEmit(entry, resolved, 'error')
    setTimeout(() => rewatch(resolved), 60)
  })
  return w
}

/** Remember the renderer to push FILE_CHANGED events to. Idempotent; on first
 *  bind we also tear every watcher down when the window is destroyed, so no
 *  fs watcher outlives the window (hide keeps them alive; destroy clears them). */
export function bindWebContents(wc: WebContents): void {
  if (activeWc === wc) return
  activeWc = wc
  wc.once('destroyed', () => {
    if (activeWc === wc) activeWc = null
    unwatchAll()
  })
}

export function watchFile(filePath: string): boolean {
  const resolved = pathResolve(filePath)
  if (!isPathSafe(resolved)) return false
  const existing = watchers.get(resolved)
  if (existing) {
    existing.refs++
    return true
  }
  try {
    const watcher = createWatcher(resolved)
    watchers.set(resolved, { watcher, timer: null, pending: null, refs: 1 })
    return true
  } catch {
    return false
  }
}

export function unwatchFile(filePath: string): void {
  const resolved = pathResolve(filePath)
  const entry = watchers.get(resolved)
  if (!entry) return
  entry.refs--
  if (entry.refs > 0) return
  if (entry.timer) clearTimeout(entry.timer)
  try {
    entry.watcher.close()
  } catch {
    /* ignore */
  }
  watchers.delete(resolved)
}

export function unwatchAll(): void {
  for (const entry of watchers.values()) {
    if (entry.timer) clearTimeout(entry.timer)
    try {
      entry.watcher.close()
    } catch {
      /* ignore */
    }
  }
  watchers.clear()
}
