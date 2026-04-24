const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

// electron-store ESM compatibility
let Store
let store
let tray = null
let isQuitting = false

async function initStore() {
  const { default: S } = await import('electron-store')
  Store = S
  store = new Store({
    defaults: {
      windowBounds: { width: 1280, height: 800 },
      theme: 'light',
      fontSize: 15,
      editorFont: "'JetBrains Mono', 'Fira Code', monospace",
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
let pendingOpenFile = null

// 从命令行参数中提取要打开的 .md/.markdown/.txt 文件路径
function extractFileArg(argv) {
  if (!argv || argv.length === 0) return null
  // 跳过可执行文件本身（开发模式下还有 . 之类的参数）
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (!a || a.startsWith('-')) continue
    if (a === '.' || a.endsWith('.js')) continue
    if (/\.(md|markdown|txt)$/i.test(a)) {
      try {
        if (fs.existsSync(a)) return path.resolve(a)
      } catch (e) {}
    }
  }
  return null
}

function sendOpenFile(filePath) {
  if (!filePath || !mainWindow) return
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const name = path.basename(filePath)
    mainWindow.webContents.send('open-file-from-os', { filePath, content, name })
  } catch (e) {
    console.error('open-file-from-os failed:', e)
  }
}

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
    frame: false,                // 完全无边框，标题栏由渲染进程自绘
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#0a0a0c',
    show: false
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  // 渲染进程加载完成后，如果有待打开文件则发送
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenFile) {
      sendOpenFile(pendingOpenFile)
      pendingOpenFile = null
    }
  })

  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize()
    store.set('windowBounds', { width: w, height: h })
  })

  mainWindow.on('maximize', () => mainWindow.webContents.send('win-maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win-maximized', false))

  // 关闭拦截：只隐藏窗口，应用继续后台运行（通过托盘可恢复）
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
      return false
    }
  })

  setupTray()
  setupMenu()
}

function setupTray() {
  if (tray) return
  const iconPath = path.join(__dirname, '../assets/icons/icon.ico')
  const image = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()
  tray = new Tray(image)
  tray.setToolTip('Markdown Editor')

  const showWindow = () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  const menu = Menu.buildFromTemplate([
    { label: '显示 Markdown Editor', click: showWindow },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
}

function setupMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu-new') },
        { label: '打开', accelerator: 'CmdOrCtrl+O', click: () => mainWindow.webContents.send('menu-open') },
        { label: '最近文件', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow.webContents.send('menu-recent') },
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
        { label: '模板库', click: () => mainWindow.webContents.send('menu-templates') }
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
      // 原子写：先写 .tmp，再 rename，避免崩溃损坏原文件
      const tmp = filePath + '.tmp'
      await fs.promises.writeFile(tmp, content, 'utf-8')
      await fs.promises.rename(tmp, filePath)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // 保存图片（粘贴/拖拽）— 写入 baseDir/assets，返回相对路径
  ipcMain.handle('image-save', async (_, { baseDir, fileName, dataBase64 }) => {
    try {
      // baseDir 为 null 时落到用户数据目录的 pasted-images 下
      const dir = baseDir
        ? path.join(baseDir, 'assets')
        : path.join(app.getPath('userData'), 'pasted-images')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      // 防重名
      let name = fileName
      let absPath = path.join(dir, name)
      let i = 1
      while (fs.existsSync(absPath)) {
        const ext = path.extname(fileName)
        const stem = path.basename(fileName, ext)
        name = `${stem}-${i}${ext}`
        absPath = path.join(dir, name)
        i++
      }
      fs.writeFileSync(absPath, Buffer.from(dataBase64, 'base64'))

      // 返回相对路径（相对于 baseDir）；无 baseDir 时返回绝对路径（file:// 形式）
      const relPath = baseDir
        ? path.relative(baseDir, absPath).replace(/\\/g, '/')
        : 'file:///' + absPath.replace(/\\/g, '/')
      return { success: true, relPath, absPath }
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

  // 聚焦窗口（用于模态关闭后恢复编辑器焦点）
  // Windows 下 Electron 在原生对话框/模态关闭后不会自动把 OS 键盘焦点
  // 回传到 webContents。单独调用 focus() 在已聚焦窗口上是 no-op，
  // 必须先 blur 再 focus 才能真正重置 Win32 的 GetFocus() 状态。
  ipcMain.handle('focus-window', () => {
    if (!mainWindow) return
    if (process.platform === 'win32') {
      mainWindow.blur()
    }
    mainWindow.focus()
    mainWindow.webContents.focus()
  })

  // 更新 Windows 标题栏 overlay 颜色（跟随主题）
  ipcMain.handle('update-titlebar', (_, { color, symbolColor }) => {
    if (!mainWindow) return
    if (process.platform === 'win32' && mainWindow.setTitleBarOverlay) {
      try {
        mainWindow.setTitleBarOverlay({ color, symbolColor, height: 46 })
      } catch (e) {}
    }
  })

  // 自绘标题栏窗口控制
  ipcMain.handle('win-minimize', () => mainWindow && mainWindow.minimize())
  ipcMain.handle('win-toggle-maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) { mainWindow.unmaximize(); return false }
    mainWindow.maximize(); return true
  })
  ipcMain.handle('win-close', () => mainWindow && mainWindow.close())
  ipcMain.handle('win-is-maximized', () => mainWindow ? mainWindow.isMaximized() : false)
}

// 单实例锁：防止重复启动多个进程
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // 第二次启动时，解析命令行参数打开文件
    const fileArg = extractFileArg(argv)
    if (fileArg) sendOpenFile(fileArg)

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  // macOS: 通过 Finder/"打开方式" 触发
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (mainWindow) sendOpenFile(filePath)
    else pendingOpenFile = filePath
  })

  app.whenReady().then(() => {
    // 首次启动，记录命令行中要打开的文件
    pendingOpenFile = extractFileArg(process.argv)
    setupIPC()
    createWindow()
  })
}

app.on('window-all-closed', () => {
  // 不退出：所有窗口关闭后留驻后台（通过托盘恢复 / 退出）
  // macOS 保持原生行为
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
