import type { PaneOrder, Settings, Theme, ViewMode } from '@shared/types'
import { createSignal, type Signal } from './signal'

export interface TabState {
  id: string
  title: string
  filePath: string | null
  modified: boolean
}

export interface AppStore {
  // Tabs
  tabs: Signal<TabState[]>
  activeTabId: Signal<string | null>

  // Layout / view
  viewMode: Signal<ViewMode>
  paneOrder: Signal<PaneOrder>
  dividerPos: Signal<number>
  focusMode: Signal<boolean>

  // Settings (full snapshot)
  theme: Signal<Theme>
  settings: Signal<Settings>

  // Editor state
  saving: Signal<boolean>
  autosaveMs: Signal<number>
}

export function createAppStore(initialSettings: Settings, initialDividerPos = 0): AppStore {
  return {
    tabs: createSignal<TabState[]>([]),
    activeTabId: createSignal<string | null>(null),

    viewMode: createSignal<ViewMode>('split'),
    paneOrder: createSignal<PaneOrder>(initialSettings.paneOrder),
    dividerPos: createSignal<number>(initialDividerPos),
    focusMode: createSignal<boolean>(false),

    theme: createSignal<Theme>(initialSettings.theme),
    settings: createSignal<Settings>(initialSettings),

    saving: createSignal(false),
    autosaveMs: createSignal(initialSettings.autoSaveInterval * 1000),
  }
}
