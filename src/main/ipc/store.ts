import { ipcMain } from 'electron'
import type Store from 'electron-store'
import { CH, STORE_KEYS, STORE_SCHEMAS, type StoreKey, type StoreSchema, type StoreSetResult } from '@shared/ipc'

const ALLOWLIST = new Set<string>(STORE_KEYS)

export function registerStoreIpc(store: Store<StoreSchema>): void {
  ipcMain.handle(CH.STORE_GET, (_event, key: string) => {
    if (!ALLOWLIST.has(key)) return undefined
    return store.get(key as keyof StoreSchema)
  })

  ipcMain.handle(CH.STORE_SET, (_event, key: string, value: unknown): StoreSetResult => {
    if (!ALLOWLIST.has(key)) return { success: false, error: `key not allowed: ${key}` }
    // Validate the value against the key's schema before persisting — the key
    // allowlist alone doesn't stop arbitrary JSON being stored under a trusted
    // key and later consumed as a typed value.
    const parsed = STORE_SCHEMAS[key as StoreKey].safeParse(value)
    if (!parsed.success) {
      return { success: false, error: `invalid value for "${key}": ${parsed.error.message}` }
    }
    try {
      store.set(key as keyof StoreSchema, parsed.data)
      return { success: true, key }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
