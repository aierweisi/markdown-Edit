import { debounce } from '@/lib/debounce'
import type { AppStore } from './app-store'
import type { StoreKey, StoreSchema } from '@shared/ipc'

const PERSIST_DEBOUNCE_MS = 200

function persist<K extends StoreKey>(key: K, value: StoreSchema[K]): void {
  void window.api.storeSet(key, value)
}

/**
 * Subscribe app-store signals to electron-store, debounced. Returns an
 * unsubscribe that detaches every bridge.
 */
export function bindPersistence(store: AppStore): () => void {
  const unsubs: Array<() => void> = []

  // theme is part of settings but mirrored as its own signal for fast reads
  unsubs.push(
    store.theme.subscribe(
      debounce((next) => persist('theme', next), PERSIST_DEBOUNCE_MS),
    ),
  )

  unsubs.push(
    store.settings.subscribe(
      debounce((next) => {
        persist('fontSize', next.fontSize)
        persist('editorFont', next.editorFont)
        persist('autoSaveInterval', next.autoSaveInterval)
        persist('exportDir', next.exportDir)
        persist('exportNamingRule', next.exportNamingRule)
        persist('imageSaveDir', next.imageSaveDir)
        persist('paneOrder', next.paneOrder)
        persist('statusBar', next.statusBar)
      }, PERSIST_DEBOUNCE_MS),
    ),
  )

  unsubs.push(
    store.paneOrder.subscribe(
      debounce((next) => persist('paneOrder', next), PERSIST_DEBOUNCE_MS),
    ),
  )

  unsubs.push(
    store.dividerPos.subscribe(
      debounce((next) => persist('dividerPos', next), PERSIST_DEBOUNCE_MS),
    ),
  )

  // NOTE: tab order is intentionally NOT persisted here — session restore
  // takes its order from the `cache` entry's tab ids, and persisting tabOrder
  // separately only produced config.json writes on every dirty toggle.

  return () => unsubs.forEach((u) => u())
}
