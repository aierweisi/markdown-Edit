const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

// electron-store ESM compatibility
let Store
let store

async function initStore() {
  const { default: S } = await import('electron-store')
  Store = S
  store = new Store({
    defaults: {
      windowBounds: { width: 1280, height: 800 },
      theme: 'light',
      fontSize: 15,
      editorFont: 'monospace',
      autoSaveInterval: 10,
      exportDir: '',
      exportNamingRule: '{title}_{date}',
      templates: [],
      cache: {},
      recentFiles: [],
      paneOrder: 'preview-first'
    }
  })
}

let mainWindow

async function createWindow() {
  await initStore()

  const { width, height } = store.get('windowBounds')

  const iconPath = path.join(__dirname, '../assets/icons/icon.ico')

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1e1e2e',
    show: false
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize()
    store.set('windowBounds', { width: w, height: h })
  })

  setupMenu()
  setupIPC()
}

function setupMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-new') },
        { label: '打开', accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('menu-open') },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('menu-save') },
        { label: '另存为', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('menu-save-as') },
        { type: 'separator' },
        { label: '导入文件', click: () => mainWindow.webContents.send('menu-import') },
        { label: '导出 Markdown', click: () => mainWindow.webContents.send('menu-export-md') },
        { label: '导出 HTML', click: () => mainWindow.webContents.send('menu-export-html') },
        { label: '导出 PDF', click: () => mainWindow.webContents.send('menu-export-pdf') },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '切换主题', accelerator: 'CmdOrCtrl+Shift+T', click: () => mainWindow.webContents.send('menu-toggle-theme') },
        { label: '切换视图模式', accelerator: 'CmdOrCtrl+\\', click: () => mainWindow.webContents.send('menu-toggle-view') },
        { type: 'separator' },
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '模板',
      submenu: [
        { label: '模板管理', click: () => mainWindow.webContents.send('menu-templates') }
      ]
    },
    {
      label: '设置',
      click: () => mainWindow.webContents.send('menu-settings')
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function setupIPC() {
  // store操作
  ipcMain.handle('store-get', (_, key) => store.get(key))
  ipcMain.handle('store-set', (_, key, value) => store.set(key, value))
  ipcMain.handle('store-delete', (_, key) => store.delete(key))

  // 文件读取
  ipcMain.handle('file-read', async (_, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // 文件保存
  ipcMain.handle('file-save', async (_, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // 打开文件对话框
  ipcMain.handle('dialog-open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result
  })

  // 保存文件对话框
  ipcMain.handle('dialog-save-file', async (_, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options.defaultPath || '',
      filters: options.filters || [{ name: 'Markdown', extensions: ['md'] }]
    })
    return result
  })

  // 选择目录
  ipcMain.handle('dialog-select-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result
  })

  // 导出PDF
  ipcMain.handle('export-pdf', async (_, outputPath) => {
    try {
      const data = await mainWindow.webContents.printToPDF({
        marginsType: 0,
        printBackground: true,
        pageSize: 'A4'
      })
      fs.writeFileSync(outputPath, data)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // 在文件管理器中显示
  ipcMain.handle('shell-show-item', (_, filePath) => {
    shell.showItemInFolder(filePath)
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
