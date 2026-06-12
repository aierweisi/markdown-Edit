import type { DomRefs } from './dom'
import type { AppStore } from './state/app-store'

/**
 * Single object threaded through every renderer module. Removes the need for
 * window.* globals to bridge between editor / tabs / preview / UI modules.
 */
export interface AppContext {
  store: AppStore
  dom: DomRefs
  api: Window['api']
}

export function createAppContext(store: AppStore, dom: DomRefs): AppContext {
  return { store, dom, api: window.api }
}
