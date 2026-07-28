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

  // Serialize read-modify-write ops so concurrent calls (e.g. opening several
  // files at once, or a rename doing remove+add) can't clobber each other.
  let chain: Promise<unknown> = Promise.resolve()
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn).catch((err: unknown) => {
      // Keep the chain going + surface the failure visibly (callers use `void`),
      // instead of letting it become an unhandled rejection.
      console.warn('[recent] operation failed:', err)
      return undefined as unknown as T
    })
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    add(filePath) {
      return serialize(async () => {
        const list = await readAll()
        const filtered = list.filter((r) => r.path !== filePath)
        filtered.unshift({
          path: filePath,
          name: getFileName(filePath),
          lastOpenedAt: Date.now(),
        })
        await writeAll(filtered.slice(0, MAX_RECENT))
      })
    },
    remove(filePath) {
      return serialize(async () => {
        const list = await readAll()
        await writeAll(list.filter((r) => r.path !== filePath))
      })
    },
    list: readAll,
  }
}
