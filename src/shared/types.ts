// Cross-process domain types. Pure data shapes — no behavior.

export type Platform = 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32' | 'cygwin' | 'netbsd' | 'android' | 'haiku'

export type Theme = 'light' | 'dark' | 'auto'

export type ViewMode = 'split' | 'editor' | 'preview'

export type PaneOrder = 'preview-first' | 'editor-first'

export interface WindowBounds {
  width: number
  height: number
}

export interface Settings {
  theme: Theme
  fontSize: number
  editorFont: string
  autoSaveInterval: number
  exportDir: string
  exportNamingRule: string
  imageSaveDir: string
  paneOrder: PaneOrder
  lineNumbers: boolean
  codeFolding: boolean
  imageCompressEnabled: boolean
  imageCompressMaxSize: number
  imageCompressQuality: number
  statusBar: StatusBarConfig
}

export interface StatusBarConfig {
  cursor: boolean
  selection: boolean
  readtime: boolean
  chars: boolean
  autosave: boolean
}

export interface Template {
  id: string
  name: string
  icon: string
  content: string
  createdAt: number
}

export interface RecentFile {
  path: string
  name: string
  lastOpenedAt: number
}

export interface TabSnapshot {
  id: string
  title: string
  filePath: string | null
  content: string
  modified: boolean
  scrollTop: number
}

export interface CacheEntry {
  /** Schema version; old caches without it are treated as incompatible. */
  version?: number
  tabs: TabSnapshot[]
  activeTabId: string | null
  savedAt: number
}

export interface ImageSaveRequest {
  baseDir: string | null
  fileName: string
  dataBase64: string
  imageDir: string
}

export interface ImageSaveResult {
  success: true
  relPath: string
  absPath: string
}

export interface ErrorResult {
  success: false
  error: string
}

export type Result<T extends object = object> = (T & { success: true }) | ErrorResult

export interface FileReadResult {
  content: string
}

export interface FileRenameResult {
  newPath: string
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface PdfExportOptions {
  pageSize: 'A4' | 'Letter' | 'Legal'
  landscape: boolean
  /** 0 = default, 1 = none, 2 = minimum (Electron printToPDF marginsType). */
  marginsType: 0 | 1 | 2
  pageNumbers: boolean
}

export interface ExportPdfRequest extends PdfExportOptions {
  savePath: string
}

export interface SaveDialogOptions {
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

export interface OpenFileFromOSPayload {
  filePath: string
  content: string
  name: string
}

export interface OpenFileErrorPayload {
  filePath: string
  error: string
}
