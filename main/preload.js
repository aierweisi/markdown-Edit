const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Store
  storeGet: (key) => ipcRenderer.invoke('store-get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: (key) => ipcRenderer.invoke('store-delete', key),

  // File
  fileRead: (filePath) => ipcRenderer.invoke('file-read', filePath),
  fileSave: (filePath, content) => ipcRenderer.invoke('file-save', filePath, content),

  // Dialogs
  dialogOpenFile: () => ipcRenderer.invoke('dialog-open-file'),
  dialogSaveFile: (options) => ipcRenderer.invoke('dialog-save-file', options),
  dialogSelectDir: () => ipcRenderer.invoke('dialog-select-dir'),

  // Export
  exportPDF: (outputPath) => ipcRenderer.invoke('export-pdf', outputPath),

  // Shell
  shellShowItem: (filePath) => ipcRenderer.invoke('shell-show-item', filePath),

  // Menu events
  onMenuEvent: (callback) => {
    const events = [
      'menu-new', 'menu-open', 'menu-save', 'menu-save-as',
      'menu-import', 'menu-export-md', 'menu-export-html', 'menu-export-pdf',
      'menu-toggle-theme', 'menu-toggle-view', 'menu-templates', 'menu-settings'
    ]
    events.forEach(event => {
      ipcRenderer.on(event, () => callback(event))
    })
  }
})
