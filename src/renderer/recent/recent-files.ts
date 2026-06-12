import type { AppContext } from '../context'
import type { RecentFile } from '@shared/types'
import { getFileName } from '../lib/fs-paths'

const MAX_RECENT = 20

export interface RecentManager {
  add(filePath: string): Promise<void>
  remove(filePath: string): Promise<void>
  list(): Promise<RecentFile[]>
}

export function createRecentManager(ctx: AppContext): RecentManager {
  async function readAll(): Promise<RecentFile[]> {
    return (await ctx.api.storeGet('recentFiles')) ?? []
  }

  async function writeAll(list: RecentFile[]): Promise<void> {
    await ctx.api.storeSet('recentFiles', list)
  }

  return {
    async add(filePath) {
      const list = await readAll()
      const filtered = list.filter((r) => r.path !== filePath)
      filtered.unshift({
        path: filePath,
        name: getFileName(filePath),
        lastOpenedAt: Date.now(),
      })
      await writeAll(filtered.slice(0, MAX_RECENT))
    },
    async remove(filePath) {
      const list = await readAll()
      await writeAll(list.filter((r) => r.path !== filePath))
    },
    list: readAll,
  }
}
