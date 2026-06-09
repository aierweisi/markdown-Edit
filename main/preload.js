const {contextBridge: contextBridge, ipcRenderer: ipcRenderer} = require("electron");

contextBridge.exposeInMainWorld("api", {
  platform: process.platform,
  storeGet: e => ipcRenderer.invoke("store-get", e),
  storeSet: (e, i) => ipcRenderer.invoke("store-set", e, i),
  fileRead: e => ipcRenderer.invoke("file-read", e),
  fileSave: (e, i) => ipcRenderer.invoke("file-save", e, i),
  fileRename: (e, i) => ipcRenderer.invoke("file-rename", e, i),
  imageSave: e => ipcRenderer.invoke("image-save", e),
  dialogOpenFile: () => ipcRenderer.invoke("dialog-open-file"),
  dialogSaveFile: e => ipcRenderer.invoke("dialog-save-file", e),
  dialogSelectDir: () => ipcRenderer.invoke("dialog-select-dir"),
  exportPDF: e => ipcRenderer.invoke("export-pdf", e),
  shellShowItem: e => ipcRenderer.invoke("shell-show-item", e),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  focusWindow: () => ipcRenderer.invoke("focus-window"),
  hasPendingFile: () => ipcRenderer.invoke("has-pending-file"),
  updateTitleBar: e => ipcRenderer.invoke("update-titlebar", e),
  winMinimize: () => ipcRenderer.invoke("win-minimize"),
  winToggleMaximize: () => ipcRenderer.invoke("win-toggle-maximize"),
  winClose: () => ipcRenderer.invoke("win-close"),
  winIsMaximized: () => ipcRenderer.invoke("win-is-maximized"),
  onWinMaximized: e => ipcRenderer.on("win-maximized", (i, n) => e(n)),
  onOpenFileFromOS: e => ipcRenderer.on("open-file-from-os", (i, n) => e(n)),
  onMenuEvent: e => {
    [ "menu-new", "menu-open", "menu-save", "menu-save-as", "menu-import", "menu-export-md", "menu-export-html", "menu-export-pdf", "menu-toggle-theme", "menu-toggle-view", "menu-templates", "menu-settings", "menu-recent" ].forEach(i => {
      ipcRenderer.on(i, () => e(i));
    });
  }
});