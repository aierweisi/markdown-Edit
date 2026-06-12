import type { AppContext } from '../context'
import type { TabState } from '../state/app-store'

export interface TabContent {
  title?: string
  filePath?: string | null
  content?: string
}

export interface TabManager {
  create(content?: TabContent): TabState
  close(id: string): void
  setActive(id: string): void
  setTitle(id: string, title: string, filePath?: string | null): void
  markModified(id: string, modified: boolean): void
  getActive(): TabState | null
  getAll(): TabState[]
  getById(id: string): TabState | null
  /** Get the current document content for the active tab (in-memory snapshot). */
  getContent(id: string): string
  setContent(id: string, text: string): void
}

let nextSuffix = 1

function makeId(): string {
  return `tab_${Date.now().toString(36)}_${(nextSuffix++).toString(36)}`
}

export function createTabManager(ctx: AppContext): TabManager {
  // Renderer-side in-memory document storage; persisted by CacheManager (Phase 6).
  const contents = new Map<string, string>()

  function snapshot(): TabState[] {
    return ctx.store.tabs()
  }

  function mutate(fn: (tabs: TabState[]) => TabState[]): void {
    ctx.store.tabs.set(fn(snapshot()))
  }

  const manager: TabManager = {
    create(input = {}) {
      const id = makeId()
      const tab: TabState = {
        id,
        title: input.title ?? '未命名',
        filePath: input.filePath ?? null,
        modified: false,
      }
      contents.set(id, input.content ?? '')
      mutate((tabs) => [...tabs, tab])
      return tab
    },

    close(id) {
      contents.delete(id)
      mutate((tabs) => tabs.filter((t) => t.id !== id))
      const active = ctx.store.activeTabId()
      if (active === id) {
        const remaining = ctx.store.tabs()
        ctx.store.activeTabId.set(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
      }
    },

    setActive(id) {
      ctx.store.activeTabId.set(id)
    },

    setTitle(id, title, filePath) {
      mutate((tabs) =>
        tabs.map((t) =>
          t.id === id ? { ...t, title, filePath: filePath !== undefined ? filePath : t.filePath } : t,
        ),
      )
    },

    markModified(id, modified) {
      mutate((tabs) => tabs.map((t) => (t.id === id ? { ...t, modified } : t)))
    },

    getActive() {
      const id = ctx.store.activeTabId()
      if (!id) return null
      return ctx.store.tabs().find((t) => t.id === id) ?? null
    },

    getAll: () => snapshot(),

    getById(id) {
      return ctx.store.tabs().find((t) => t.id === id) ?? null
    },

    getContent(id) {
      return contents.get(id) ?? ''
    },

    setContent(id, text) {
      contents.set(id, text)
    },
  }

  return manager
}
