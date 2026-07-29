import { z } from 'zod'
import type {
  CacheEntry,
  ExportPdfRequest,
  PdfExportOptions,
  DirEntry,
  FileReadResult,
  FileRenameResult,
  ImageSaveRequest,
  ImageSaveResult,
  OpenFileErrorPayload,
  OpenFileFromOSPayload,
  Result,
  SaveDialogOptions,
  Template,
  Platform,
  RecentFile,
  Theme,
  WindowBounds,
  PaneOrder,
} from './types'

export type { Result } from './types'

// ── Allowlisted electron-store keys ─────────────────────────────────────
// Top-level keys only. `cache.*` is special-cased in the handler.
export const STORE_KEYS = [
  'windowBounds',
  'theme',
  'fontSize',
  'editorFont',
  'autoSaveInterval',
  'exportDir',
  'exportNamingRule',
  'imageSaveDir',
  'paneOrder',
  'lineNumbers',
  'codeFolding',
  'imageCompressEnabled',
  'imageCompressMaxSize',
  'imageCompressQuality',
  'dividerPos',
  'templates',
  'recentFiles',
  'tabOrder',
  'pdfOptions',
  'workspacePath',
  'cache',
] as const

export type StoreKey = (typeof STORE_KEYS)[number]

// Map of typed values per key. Used by renderer for narrowing `storeGet` returns.
export interface StoreSchema {
  windowBounds: WindowBounds
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
  dividerPos: number
  templates: Template[]
  recentFiles: RecentFile[]
  tabOrder: string[]
  pdfOptions: PdfExportOptions
  workspacePath: string | null
  cache: CacheEntry
}

// ── IPC channel constants ───────────────────────────────────────────────
export const CH = {
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  FILE_READ: 'file:read',
  FILE_SAVE: 'file:save',
  FILE_RENAME: 'file:rename',
  IMAGE_SAVE: 'image:save',
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_SAVE_FILE: 'dialog:save-file',
  DIALOG_SELECT_DIR: 'dialog:select-dir',
  EXPORT_PDF: 'export:pdf',
  SHELL_SHOW_ITEM: 'shell:show-item',
  CLEAR_CACHE: 'system:clear-cache',
  FOCUS_WINDOW: 'window:focus',
  UPDATE_TITLEBAR: 'window:update-titlebar',
  WIN_MINIMIZE: 'window:minimize',
  WIN_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WIN_CLOSE: 'window:close',
  WIN_IS_MAXIMIZED: 'window:is-maximized',
  HAS_PENDING_FILE: 'system:has-pending-file',
  WORKSPACE_LIST: 'workspace:list',
  FILE_CREATE: 'file:create',
  FILE_DELETE: 'file:delete',
  WORKSPACE_RESOLVE_WIKI: 'workspace:resolve-wiki',
} as const

// Main → Renderer one-way events
export const EV = {
  OPEN_FILE_FROM_OS: 'event:open-file-from-os',
  OPEN_FILE_ERROR: 'event:open-file-error',
  WIN_MAXIMIZED: 'event:win-maximized',
  MENU_NEW: 'menu:new',
  MENU_OPEN: 'menu:open',
  MENU_SAVE: 'menu:save',
  MENU_SAVE_AS: 'menu:save-as',
  MENU_IMPORT: 'menu:import',
  MENU_EXPORT_MD: 'menu:export-md',
  MENU_EXPORT_HTML: 'menu:export-html',
  MENU_EXPORT_PDF: 'menu:export-pdf',
  MENU_TOGGLE_THEME: 'menu:toggle-theme',
  MENU_TOGGLE_VIEW: 'menu:toggle-view',
  MENU_TOGGLE_FOCUS: 'menu:toggle-focus',
  MENU_OPEN_WORKSPACE: 'menu:open-workspace',
  MENU_TEMPLATES: 'menu:templates',
  MENU_SETTINGS: 'menu:settings',
  MENU_RECENT: 'menu:recent',
} as const

export type MenuEventName =
  | typeof EV.MENU_NEW
  | typeof EV.MENU_OPEN
  | typeof EV.MENU_SAVE
  | typeof EV.MENU_SAVE_AS
  | typeof EV.MENU_IMPORT
  | typeof EV.MENU_EXPORT_MD
  | typeof EV.MENU_EXPORT_HTML
  | typeof EV.MENU_EXPORT_PDF
  | typeof EV.MENU_TOGGLE_THEME
  | typeof EV.MENU_TOGGLE_VIEW
  | typeof EV.MENU_TOGGLE_FOCUS
  | typeof EV.MENU_OPEN_WORKSPACE
  | typeof EV.MENU_TEMPLATES
  | typeof EV.MENU_SETTINGS
  | typeof EV.MENU_RECENT

// ── zod schemas for runtime IPC validation ─────────────────────────────
export const StoreKeySchema = z.enum(STORE_KEYS)

export const FileReadReqSchema = z.string().min(1)
export const FileSaveReqSchema = z.object({ filePath: z.string().min(1), content: z.string() })
export const FileRenameReqSchema = z.object({ oldPath: z.string().min(1), newPath: z.string().min(1) })

export const ImageSaveReqSchema = z.object({
  baseDir: z.string().nullable(),
  fileName: z.string().min(1).max(255),
  dataBase64: z.string().min(1),
  imageDir: z.string(),
})

export const SaveDialogOptsSchema = z.object({
  defaultPath: z.string().optional(),
  filters: z
    .array(z.object({ name: z.string(), extensions: z.array(z.string()) }))
    .optional(),
})

export const PdfExportOptionsSchema = z.object({
  pageSize: z.enum(['A4', 'Letter', 'Legal']),
  landscape: z.boolean(),
  marginsType: z.number().int().min(0).max(2),
  pageNumbers: z.boolean(),
})
export const ExportPdfReqSchema = PdfExportOptionsSchema.extend({ savePath: z.string().min(1) })

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  pageSize: 'A4',
  landscape: false,
  marginsType: 0,
  pageNumbers: true,
}

export const ShellShowItemReqSchema = z.string().min(1)

export const DirListReqSchema = z.string().min(1)
export const FileCreateReqSchema = z.object({ path: z.string().min(1), isDir: z.boolean() })
export const FileDeleteReqSchema = z.object({ path: z.string().min(1), isDir: z.boolean() })
export const ResolveWikiReqSchema = z.string().min(1)

export type WorkspaceListResp = Result<{ entries: DirEntry[] }>
export type WorkspaceResolveResp = Result<{ path: string }>

export const UpdateTitlebarReqSchema = z.object({
  color: z.string().min(1),
  symbolColor: z.string().min(1),
})

// ── Result helpers ──────────────────────────────────────────────────────
export type StoreSetResult = Result<{ key: string }>
export type FileReadResp = Result<FileReadResult>
export type FileSaveResp = Result
export type FileRenameResp = Result<FileRenameResult>
export type ImageSaveResp = ImageSaveResult | { success: false; error: string }
export type ExportPdfResp = Result
export type ClearCacheResp = Result<{ freed: number }>

// ── Dialog open/save result aliases (lifted from Electron's Dialog API) ─
export interface DialogOpenResult {
  canceled: boolean
  filePaths: string[]
}

export interface DialogSaveResult {
  canceled: boolean
  filePath?: string
}

// ── Renderer-facing typed Api surface ───────────────────────────────────
export interface Api {
  readonly platform: Platform

  // Storage
  storeGet<K extends StoreKey>(key: K): Promise<StoreSchema[K] | undefined>
  storeSet<K extends StoreKey>(key: K, value: StoreSchema[K]): Promise<StoreSetResult>

  // File ops
  fileRead(filePath: string): Promise<FileReadResp>
  fileSave(filePath: string, content: string): Promise<FileSaveResp>
  fileRename(oldPath: string, newPath: string): Promise<FileRenameResp>
  imageSave(req: ImageSaveRequest): Promise<ImageSaveResp>

  // Dialogs
  dialogOpenFile(): Promise<DialogOpenResult>
  dialogSaveFile(opts: SaveDialogOptions): Promise<DialogSaveResult>
  dialogSelectDir(): Promise<DialogOpenResult>

  // Export
  exportPDF(req: ExportPdfRequest): Promise<ExportPdfResp>

  // Shell / system
  shellShowItem(itemPath: string): Promise<Result>
  workspaceList(dirPath: string): Promise<WorkspaceListResp>
  fileCreate(path: string, isDir: boolean): Promise<Result>
  fileDelete(path: string, isDir: boolean): Promise<Result>
  workspaceResolveWiki(name: string): Promise<WorkspaceResolveResp>
  clearCache(): Promise<ClearCacheResp>
  focusWindow(): Promise<void>
  hasPendingFile(): Promise<boolean>
  getFilePath(file: File): string

  // Window controls
  updateTitleBar(opts: { color: string; symbolColor: string }): Promise<void>
  winMinimize(): Promise<void>
  winToggleMaximize(): Promise<boolean>
  winClose(): Promise<void>
  winIsMaximized(): Promise<boolean>

  // Event subscriptions (return unsubscribe)
  onWinMaximized(cb: (maximized: boolean) => void): () => void
  onOpenFileFromOS(cb: (payload: OpenFileFromOSPayload) => void): () => void
  onOpenFileError(cb: (payload: OpenFileErrorPayload) => void): () => void
  onMenuEvent(cb: (event: MenuEventName) => void): () => void
}
