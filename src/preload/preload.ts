import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CH, EV, type Api, type MenuEventName } from '@shared/ipc'

const MENU_EVENT_LIST: MenuEventName[] = [
  EV.MENU_NEW,
  EV.MENU_OPEN,
  EV.MENU_SAVE,
  EV.MENU_SAVE_AS,
  EV.MENU_IMPORT,
  EV.MENU_EXPORT_MD,
  EV.MENU_EXPORT_HTML,
  EV.MENU_EXPORT_PDF,
  EV.MENU_TOGGLE_THEME,
  EV.MENU_TOGGLE_VIEW,
  EV.MENU_TOGGLE_FOCUS,
  EV.MENU_OPEN_WORKSPACE,
  EV.MENU_TEMPLATES,
  EV.MENU_SETTINGS,
  EV.MENU_RECENT,
]

let menuListenerBound = false

const api: Api = {
  platform: process.platform,

  storeGet: (key) => ipcRenderer.invoke(CH.STORE_GET, key),
  storeSet: (key, value) => ipcRenderer.invoke(CH.STORE_SET, key, value),

  fileRead: (filePath) => ipcRenderer.invoke(CH.FILE_READ, filePath),
  fileSave: (filePath, content) => ipcRenderer.invoke(CH.FILE_SAVE, filePath, content),
  fileRename: (oldPath, newPath) => ipcRenderer.invoke(CH.FILE_RENAME, oldPath, newPath),
  imageSave: (req) => ipcRenderer.invoke(CH.IMAGE_SAVE, req),

  dialogOpenFile: () => ipcRenderer.invoke(CH.DIALOG_OPEN_FILE),
  dialogSaveFile: (opts) => ipcRenderer.invoke(CH.DIALOG_SAVE_FILE, opts),
  dialogSelectDir: () => ipcRenderer.invoke(CH.DIALOG_SELECT_DIR),

  exportPDF: (req) => ipcRenderer.invoke(CH.EXPORT_PDF, req),

  shellShowItem: (itemPath) => ipcRenderer.invoke(CH.SHELL_SHOW_ITEM, itemPath),
  workspaceList: (dirPath) => ipcRenderer.invoke(CH.WORKSPACE_LIST, dirPath),
  fileCreate: (path, isDir) => ipcRenderer.invoke(CH.FILE_CREATE, path, isDir),
  fileDelete: (path, isDir) => ipcRenderer.invoke(CH.FILE_DELETE, path, isDir),
  workspaceResolveWiki: (name) => ipcRenderer.invoke(CH.WORKSPACE_RESOLVE_WIKI, name),
  clearCache: () => ipcRenderer.invoke(CH.CLEAR_CACHE),
  focusWindow: () => ipcRenderer.invoke(CH.FOCUS_WINDOW),
  hasPendingFile: () => ipcRenderer.invoke(CH.HAS_PENDING_FILE),
  getFilePath: (file) => webUtils.getPathForFile(file),

  updateTitleBar: (opts) => ipcRenderer.invoke(CH.UPDATE_TITLEBAR, opts),
  winMinimize: () => ipcRenderer.invoke(CH.WIN_MINIMIZE),
  winToggleMaximize: () => ipcRenderer.invoke(CH.WIN_TOGGLE_MAXIMIZE),
  winClose: () => ipcRenderer.invoke(CH.WIN_CLOSE),
  winIsMaximized: () => ipcRenderer.invoke(CH.WIN_IS_MAXIMIZED),

  onWinMaximized(cb) {
    const handler = (_e: Electron.IpcRendererEvent, maximized: boolean): void => cb(maximized)
    ipcRenderer.on(EV.WIN_MAXIMIZED, handler)
    return () => ipcRenderer.removeListener(EV.WIN_MAXIMIZED, handler)
  },

  onOpenFileFromOS(cb) {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown): void =>
      cb(payload as Parameters<typeof cb>[0])
    ipcRenderer.on(EV.OPEN_FILE_FROM_OS, handler)
    return () => ipcRenderer.removeListener(EV.OPEN_FILE_FROM_OS, handler)
  },

  onOpenFileError(cb) {
    const handler = (_e: Electron.IpcRendererEvent, payload: unknown): void =>
      cb(payload as Parameters<typeof cb>[0])
    ipcRenderer.on(EV.OPEN_FILE_ERROR, handler)
    return () => ipcRenderer.removeListener(EV.OPEN_FILE_ERROR, handler)
  },

  onMenuEvent(cb) {
    if (menuListenerBound) {
      console.warn('[preload] onMenuEvent already bound; ignoring subsequent registration')
      return () => undefined
    }
    menuListenerBound = true
    const handlers = MENU_EVENT_LIST.map((channel) => {
      const handler = (): void => cb(channel)
      ipcRenderer.on(channel, handler)
      return [channel, handler] as const
    })
    return () => {
      handlers.forEach(([ch, h]) => ipcRenderer.removeListener(ch, h))
      menuListenerBound = false
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
