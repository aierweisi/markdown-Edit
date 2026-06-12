import { ipcMain, session } from 'electron'
import { CH, type ClearCacheResp } from '@shared/ipc'

const CLEAR_CACHE_COOLDOWN_MS = 3000
let lastClear = 0

export function registerSystemIpc(hasPendingFile: () => boolean): void {
  ipcMain.handle(CH.CLEAR_CACHE, async (): Promise<ClearCacheResp> => {
    const now = Date.now()
    if (now - lastClear < CLEAR_CACHE_COOLDOWN_MS) {
      return { success: false, error: 'too frequent' }
    }
    lastClear = now

    try {
      const defaultSession = session.defaultSession
      const cacheSize = await defaultSession.getCacheSize().catch(() => 0)
      await defaultSession.clearCache()
      await defaultSession.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage',
        ],
      })
      return { success: true, freed: cacheSize }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(CH.HAS_PENDING_FILE, () => hasPendingFile())
}
