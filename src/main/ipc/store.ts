import { ipcMain } from 'electron'
import type Store from 'electron-store'
import { CH, STORE_KEYS, type StoreSchema, type StoreSetResult } from '@shared/ipc'

const ALLOWLIST = new Set<string>(STORE_KEYS)

export function registerStoreIpc(store: Store<StoreSchema>): void {
  ipcMain.handle(CH.STORE_GET, (_event, key: string) => {
    if (!ALLOWLIST.has(key)) return undefined
    return store.get(key as keyof StoreSchema)
  })

  ipcMain.handle(CH.STORE_SET, (_event, key: string, value: unknown): StoreSetResult => {
    if (!ALLOWLIST.has(key)) return { success: false, error: `key not allowed: ${key}` }
    try {
      store.set(key as keyof StoreSchema, value as StoreSchema[keyof StoreSchema])
      return { success: true, key }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
