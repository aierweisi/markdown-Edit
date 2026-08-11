import type { Settings } from './types'

/** App-wide default editor settings — the single source of truth.
 *  Both the bootstrap (initial values when nothing is persisted) and the
 *  settings panel ("reset to defaults") read from here so the two can't drift
 *  apart. Keep this a subset of StoreSchema that maps to the `Settings` type. */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  fontSize: 15,
  editorFont: "'JetBrains Mono', 'Fira Code', monospace",
  autoSaveInterval: 10,
  exportDir: '',
  exportNamingRule: '{title}_{date}',
  imageSaveDir: 'assets',
  paneOrder: 'preview-first',
  lineNumbers: true,
  codeFolding: true,
  imageCompressEnabled: true,
  imageCompressMaxSize: 1920,
  imageCompressQuality: 0.85,
  statusBar: { cursor: true, selection: true, readtime: true, chars: true, autosave: true },
}
