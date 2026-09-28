import { z } from 'zod'
import type {
  CacheEntry,
  ExportPdfRequest,
  PdfExportOptions,
  DirEntry,
  FileReadResult,
  FileRenameResult,
  FileSaveResult,
  FileStatResult,
  ImageSaveRequest,
  ImageSaveResult,
  OpenFileErrorPayload,
  SearchHit,
  OpenFileFromOSPayload,
  Result,
  SaveDialogOptions,
  Template,
  Platform,
  RecentFile,
  StatusBarConfig,
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
  'pdfOptions',
  'workspacePath',
  'workspaceCollapsed',
  'workspaceClosed',
  'sidebarActiveView',
  'sidebarOpen',
  'workspaceWidth',
  'statusBar',
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
  pdfOptions: PdfExportOptions
  workspacePath: string | null
  workspaceCollapsed: boolean
  workspaceClosed: boolean
  sidebarActiveView: 'workspace' | 'outline' | 'search'
  sidebarOpen: boolean
  workspaceWidth: number
  statusBar: StatusBarConfig
  cache: CacheEntry
}

// ── IPC channel constants ───────────────────────────────────────────────
export const CH = {
  STORE_GET: 'store:get',
  STORE_SET: 'store:set',
  FILE_READ: 'file:read',
  FILE_STAT: 'file:stat',
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
  WIN_MINIMIZE: 'window:minimize',
  WIN_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WIN_CLOSE: 'window:close',
  WIN_IS_MAXIMIZED: 'window:is-maximized',
  HAS_PENDING_FILE: 'system:has-pending-file',
  REQUEST_PENDING_FILE: 'system:request-pending-file',
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_SEARCH: 'workspace:search',
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
export const FileStatReqSchema = z.string().min(1)
export const FileSaveReqSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
  /** Allow creating a NEW file at the path. Defaults to false: writing a path
   *  that doesn't exist (externally moved/deleted) fails with `moved: true`
   *  instead of silently resurrecting the file. */
  create: z.boolean().default(false),
})
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

// ── Domain schemas for electron-store values ───────────────────────────
// Used by the STORE_SET handler to validate the `value` for each allowlisted
// key (the key itself is already gated by STORE_KEYS). Without this, a
// renderer compromise (or a future bug) could persist arbitrary JSON under a
// trusted key and have it consumed later as a typed value — e.g. poisoning
// `workspacePath` / `imageSaveDir`, or crashing a consumer that assumes the
// stored shape.
export const WindowBoundsSchema = z.object({ width: z.number(), height: z.number() })

export const StatusBarConfigSchema = z.object({
  cursor: z.boolean(),
  selection: z.boolean(),
  readtime: z.boolean(),
  chars: z.boolean(),
  autosave: z.boolean(),
})

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  content: z.string(),
  createdAt: z.number(),
})

export const RecentFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  lastOpenedAt: z.number(),
})

export const TabSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  filePath: z.string().nullable(),
  content: z.string(),
  modified: z.boolean(),
  scrollTop: z.number(),
  // Disk baseline at flush time (session-restore change detection); absent in
  // older caches and never-saved tabs — keep optional so old caches validate.
  diskMtimeMs: z.number().optional(),
  diskSize: z.number().optional(),
})

export const CacheEntrySchema = z.object({
  version: z.number().optional(),
  tabs: z.array(TabSnapshotSchema),
  activeTabId: z.string().nullable(),
  savedAt: z.number(),
})

export const STORE_SCHEMAS: Record<StoreKey, z.ZodTypeAny> = {
  windowBounds: WindowBoundsSchema,
  theme: z.enum(['light', 'dark', 'auto']),
  fontSize: z.number(),
  editorFont: z.string(),
  autoSaveInterval: z.number(),
  exportDir: z.string(),
  exportNamingRule: z.string(),
  imageSaveDir: z.string(),
  paneOrder: z.enum(['preview-first', 'editor-first']),
  lineNumbers: z.boolean(),
  codeFolding: z.boolean(),
  imageCompressEnabled: z.boolean(),
  imageCompressMaxSize: z.number(),
  imageCompressQuality: z.number(),
  dividerPos: z.number(),
  templates: z.array(TemplateSchema),
  recentFiles: z.array(RecentFileSchema),
  pdfOptions: PdfExportOptionsSchema,
  workspacePath: z.string().nullable(),
  workspaceCollapsed: z.boolean(),
  workspaceClosed: z.boolean(),
  sidebarActiveView: z.enum(['workspace', 'outline', 'search']),
  sidebarOpen: z.boolean(),
  workspaceWidth: z.number(),
  statusBar: StatusBarConfigSchema,
  cache: CacheEntrySchema,
}


export const DirListReqSchema = z.string().min(1)
export const FileCreateReqSchema = z.object({ path: z.string().min(1), isDir: z.boolean() })
export const FileDeleteReqSchema = z.object({ path: z.string().min(1), isDir: z.boolean() })
export const ResolveWikiReqSchema = z.string().min(1)
export const WorkspaceSearchReqSchema = z.object({ query: z.string().trim().min(1).max(200) })

export type WorkspaceListResp = Result<{ entries: DirEntry[] }>
export type WorkspaceResolveResp = Result<{ path: string }>
export type WorkspaceSearchResp = Result<{ hits: SearchHit[]; truncated: boolean }>

// ── Result helpers ──────────────────────────────────────────────────────
export type StoreSetResult = Result<{ key: string }>
export type FileReadResp = Result<FileReadResult>
export type FileStatResp = Result<FileStatResult>
// Failure branch carries `moved: true` when the write was refused because the
// target path vanished (externally moved/deleted) — lets callers offer
// save-as instead of a generic error.
export type FileSaveResp =
  | (FileSaveResult & { success: true })
  | { success: false; error: string; moved?: boolean }
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
  fileStat(filePath: string): Promise<FileStatResp>
  fileSave(filePath: string, content: string, create?: boolean): Promise<FileSaveResp>
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
  workspaceSearch(query: string): Promise<WorkspaceSearchResp>
  clearCache(): Promise<ClearCacheResp>
  focusWindow(): Promise<void>
  hasPendingFile(): Promise<boolean>
  requestPendingFile(): Promise<void>
  getFilePath(file: File): string

  // Window controls
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
