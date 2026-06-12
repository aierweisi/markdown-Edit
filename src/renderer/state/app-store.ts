import type { PaneOrder, Settings, Theme, ViewMode } from '@shared/types'
import { createSignal, type Signal } from './signal'

export interface TabState {
  id: string
  title: string
  filePath: string | null
  modified: boolean
}

export interface FindState {
  open: boolean
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  replaceMode: boolean
}

export interface AppStore {
  // Tabs
  tabs: Signal<TabState[]>
  activeTabId: Signal<string | null>

  // Layout / view
  viewMode: Signal<ViewMode>
  paneOrder: Signal<PaneOrder>
  dividerPos: Signal<number>

  // Settings (full snapshot)
  theme: Signal<Theme>
  settings: Signal<Settings>

  // Editor state
  saving: Signal<boolean>
  autosaveMs: Signal<number>

  // Find/replace state
  findState: Signal<FindState>

  // Menu IPC pending counter (replaces window.__menuEventPending)
  menuEventPending: Signal<number>
}

export function createAppStore(initialSettings: Settings): AppStore {
  return {
    tabs: createSignal<TabState[]>([]),
    activeTabId: createSignal<string | null>(null),

    viewMode: createSignal<ViewMode>('split'),
    paneOrder: createSignal<PaneOrder>(initialSettings.paneOrder),
    dividerPos: createSignal<number>(0),

    theme: createSignal<Theme>(initialSettings.theme),
    settings: createSignal<Settings>(initialSettings),

    saving: createSignal(false),
    autosaveMs: createSignal(initialSettings.autoSaveInterval * 1000),

    findState: createSignal<FindState>({
      open: false,
      query: '',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
      replaceMode: false,
    }),

    menuEventPending: createSignal(0),
  }
}
