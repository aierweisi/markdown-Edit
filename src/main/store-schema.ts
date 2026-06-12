import type Store from 'electron-store'
import type { StoreSchema } from '@shared/ipc'
import type { CacheEntry } from '@shared/types'

const EMPTY_CACHE: CacheEntry = { tabs: [], activeTabId: null, savedAt: 0 }

export const defaults: StoreSchema = {
  windowBounds: { width: 1280, height: 800 },
  theme: 'light',
  fontSize: 15,
  editorFont: "'JetBrains Mono', 'Fira Code', monospace",
  autoSaveInterval: 10,
  exportDir: '',
  exportNamingRule: '{title}_{date}',
  imageSaveDir: 'assets',
  paneOrder: 'preview-first',
  dividerPos: 0,
  templates: [],
  recentFiles: [],
  tabOrder: [],
  cache: EMPTY_CACHE,
}

/**
 * One-time migration from the v1 store layout to the v2 schema.
 *  - Promote `tpl_v2` → `templates` (v1 wrote the user list under `tpl_v2`).
 *  - Drop the obsolete `_pendingOpenFile` and `_pendingOSFile` keys; v2 carries
 *    those as transient module state inside src/main/os-file.ts.
 *  - Backfill missing v1 keys (dividerPos / imageSaveDir / tabOrder) from defaults.
 */
export function migrateStore(store: Store<StoreSchema>): void {
  // Promote tpl_v2 → templates
  const rawStore = store as unknown as {
    get(key: string): unknown
    set(key: string, value: unknown): void
    delete(key: string): void
    has(key: string): boolean
  }

  if (rawStore.has('tpl_v2')) {
    const tplV2 = rawStore.get('tpl_v2')
    if (Array.isArray(tplV2) && tplV2.length > 0 && store.get('templates').length === 0) {
      store.set('templates', tplV2 as StoreSchema['templates'])
    }
    rawStore.delete('tpl_v2')
  }

  // Drop legacy pending-file keys
  rawStore.delete('_pendingOpenFile')
  rawStore.delete('_pendingOSFile')

  // Backfill new defaults if absent
  if (!rawStore.has('dividerPos')) store.set('dividerPos', defaults.dividerPos)
  if (!rawStore.has('imageSaveDir')) store.set('imageSaveDir', defaults.imageSaveDir)
  if (!rawStore.has('tabOrder')) store.set('tabOrder', defaults.tabOrder)
}
