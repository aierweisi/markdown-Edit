const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Store
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),

  // File
  fileRead: (filePath) => ipcRenderer.invoke('file-read', filePath),
  fileSave: (filePath, content) => ipcRenderer.invoke('file-save', filePath, content),
  imageSave: (payload) => ipcRenderer.invoke('image-save', payload),

  // Dialogs
  dialogOpenFile: () => ipcRenderer.invoke('dialog-open-file'),
  dialogSaveFile: (options) => ipcRenderer.invoke('dialog-save-file', options),
  dialogSelectDir: () => ipcRenderer.invoke('dialog-select-dir'),

  // Export
  exportPDF: (outputPath) => ipcRenderer.invoke('export-pdf', outputPath),

  // Shell
  shellShowItem: (filePath) => ipcRenderer.invoke('shell-show-item', filePath),

  // Focus window
  focusWindow: () => ipcRenderer.invoke('focus-window'),

  // Update native titlebar colors (Windows)
  updateTitleBar: (opts) => ipcRenderer.invoke('update-titlebar', opts),

  // Custom window controls (frameless)
  winMinimize: () => ipcRenderer.invoke('win-minimize'),
  winToggleMaximize: () => ipcRenderer.invoke('win-toggle-maximize'),
  winClose: () => ipcRenderer.invoke('win-close'),
  winIsMaximized: () => ipcRenderer.invoke('win-is-maximized'),
  onWinMaximized: (cb) => ipcRenderer.on('win-maximized', (_, v) => cb(v)),

  // OS 打开文件（命令行/双击/拖拽到 exe）
  onOpenFileFromOS: (cb) => ipcRenderer.on('open-file-from-os', (_, payload) => cb(payload)),

  // Menu events
  onMenuEvent: (callback) => {
    const events = [
      'menu-new', 'menu-open', 'menu-save', 'menu-save-as',
      'menu-import', 'menu-export-md', 'menu-export-html', 'menu-export-pdf',
      'menu-toggle-theme', 'menu-toggle-view', 'menu-templates', 'menu-settings',
      'menu-recent'
    ]
    events.forEach(event => {
      ipcRenderer.on(event, () => callback(event))
    })
  }
})
