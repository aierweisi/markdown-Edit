const {app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage} = require("electron"),
  path = require("path"),
  fs = require("fs");

function isPathSafe(rawPath) {
  try {
    if (!rawPath || "string" != typeof rawPath) return false;
    // 先检查原始输入是否为绝对路径
    if (!path.isAbsolute(rawPath)) return false;
    const resolvedPath = path.resolve(rawPath);
    if (!path.isAbsolute(resolvedPath)) return false;
    // 检查 .. 穿越：resolve 后原路径仍包含 .. 则拒绝
    if (rawPath.includes("..")) {
      const normalized = path.normalize(rawPath);
      if (normalized !== resolvedPath || rawPath.split(path.sep).some(p => ".." === p)) return false;
    }
    if (process.platform.startsWith("win")) {
      const upperPath = resolvedPath.toUpperCase();
      if (upperPath.startsWith("\\\\?\\") || upperPath.startsWith("\\\\.\\") || /^[A-Z]:\\\\(?:NUL|CON|PRN|AUX|COM\d+|LPT\d+)(?:\.|$)/i.test(resolvedPath)) return false;
    }
    // 检查符号链接：只检查路径末端（或父目录）是否为直接符号链接
    // 用 lstatSync 判断：如果文件存在且是 symlink 则拒绝；
    // 如果文件不存在（保存新文件），检查父目录是否安全即可
    try {
      const stat = fs.lstatSync(resolvedPath);
      if (stat.isSymbolicLink()) return false;
    } catch (_) {
      // 文件不存在：检查父目录是否存在且不是符号链接
      try {
        const dir = path.dirname(resolvedPath);
        const dirStat = fs.lstatSync(dir);
        if (dirStat.isSymbolicLink()) return false;
      } catch (_2) {
        return false;  // 父目录也不存在，不安全
      }
    }
    return true;
  } catch {
    return false;
  }
}

let Store, store, mainWindow, tray = null, isQuitting = false;

async function initStore() {
  const {default: ElectronStore} = await import("electron-store");
  Store = ElectronStore, store = new Store({
    defaults: {
      windowBounds: {
        width: 1280,
        height: 800
      },
      theme: "light",
      fontSize: 15,
      editorFont: "'JetBrains Mono', 'Fira Code', monospace",
      autoSaveInterval: 10,
      exportDir: "",
      exportNamingRule: "{title}_{date}",
      templates: [],
      cache: {},
      recentFiles: [],
      paneOrder: "preview-first"
    }
  });
}

let pendingOpenFile = null, pendingOSFile = false;

function extractFileArg(argv) {
  if (!argv || 0 === argv.length) return null;
  // Electron 打包后文件路径通常在 argv[1]（第一个位置参数），优先检查
  if (argv[1] && !argv[1].startsWith("-") && "." !== argv[1] && /\.(md|markdown|mdown|mkdn|mkd|mdwn|txt)$/i.test(argv[1])) try {
    if (fs.existsSync(argv[1])) return path.resolve(argv[1]);
  } catch (_) {}
  // 兼容开发环境：从末尾遍历查找
  for (let idx = argv.length - 1; idx >= 1; idx--) {
    const arg = argv[idx];
    if (arg && !arg.startsWith("-") && "." !== arg && !arg.endsWith(".js") && /\.(md|markdown|mdown|mkdn|mkd|mdwn|txt)$/i.test(arg)) try {
      if (fs.existsSync(arg)) return path.resolve(arg);
    } catch (_) {}
  }
  return null;
}

function sendOpenFile(filePath) {
  if (filePath && mainWindow) try {
    const content = fs.readFileSync(filePath, "utf-8"), basename = path.basename(filePath);
    mainWindow.webContents.send("open-file-from-os", {
      filePath: filePath,
      content: content,
      name: basename
    });
  } catch (err) {
    console.error("open-file-from-os failed:", err);
    // 文件读取失败（如已被删除）时通知渲染层显示提示
    mainWindow.webContents.send("open-file-error", { filePath: filePath, error: err.message });
  }
}

async function createWindow() {
  await initStore();
  // 将待打开文件路径写入 store，渲染器初始化时可同步读取（比 IPC 更早到达）
  pendingOpenFile && store.set("_pendingOpenFile", pendingOpenFile), pendingOSFile && store.set("_pendingOSFile", true);
  const {width, height} = store.get("windowBounds"), iconPath = path.join(__dirname, "../assets/icons/icon.ico"), isMac = "darwin" === process.platform;
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    minWidth: 800,
    minHeight: 600,
    icon: fs.existsSync(iconPath) ? iconPath : void 0,
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : void 0,
    trafficLightPosition: isMac ? {
      x: 14,
      y: 16
    } : void 0,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: "#0a0a0c",
    show: false
  }), mainWindow.loadFile(app && app.isPackaged ? path.join(__dirname, "../index.html") : path.join(__dirname, "../dist/index.html")),
  mainWindow.once("ready-to-show", () => {
    mainWindow.show(), app.isPackaged || mainWindow.webContents.openDevTools({
      mode: "detach"
    });
  }), mainWindow.webContents.on("did-finish-load", () => {
    pendingOpenFile && (sendOpenFile(pendingOpenFile), pendingOpenFile = null), pendingOSFile = false;
  }), mainWindow.on("resize", () => {
    const [w, h] = mainWindow.getSize();
    store.set("windowBounds", {
      width: w,
      height: h
    });
  }), mainWindow.on("maximize", () => mainWindow.webContents.send("win-maximized", true)),
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("win-maximized", false)),
  mainWindow.on("close", evt => {
    evt.preventDefault();
    if (!isQuitting) {
      // 非退出：隐藏到托盘，同步保存缓存
      mainWindow.webContents.executeJavaScript("typeof CacheManager!=='undefined'&&CacheManager.saveAll()").catch(() => {});
      mainWindow.hide();
      return;
    }
    // 退出时：async 场景用 .then() 链，保存缓存后再销毁窗口
    mainWindow.webContents.executeJavaScript("typeof CacheManager!=='undefined'&&CacheManager.saveAll()")
      .catch(() => {})
      .then(() => {
        try { mainWindow && !mainWindow.isDestroyed() && mainWindow.destroy(); } catch (_) {}
      });
  }), setupTray(), setupMenu();
}

function setupTray() {
  if (tray) return;
  const isWin = "win32" === process.platform;
  const iconName = isWin ? "icon.ico" : "icon.png";
  const iconPath = path.join(__dirname, "../assets/icons/" + iconName), iconImage = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (!isWin) iconImage.setTemplateImage(true);
  tray = new Tray(iconImage), tray.setToolTip("Markdown Editor");
  const showWindow = () => {
    mainWindow && (mainWindow.isMinimized() && mainWindow.restore(), mainWindow.show(),
    mainWindow.focus());
  }, contextMenu = Menu.buildFromTemplate([ {
    label: "显示 Markdown Editor",
    click: showWindow
  }, {
    type: "separator"
  }, {
    label: "退出",
    click: () => {
      isQuitting = true, app.quit();
    }
  } ]);
  tray.setContextMenu(contextMenu), tray.on("click", showWindow), tray.on("double-click", showWindow);
}

function setupMenu() {
  const template = [ {
    label: "文件",
    submenu: [ {
      label: "新建",
      accelerator: "CmdOrCtrl+N",
      click: () => mainWindow.webContents.send("menu-new")
    }, {
      label: "打开",
      accelerator: "CmdOrCtrl+O",
      click: () => mainWindow.webContents.send("menu-open")
    }, {
      label: "最近文件",
      accelerator: "CmdOrCtrl+Shift+R",
      click: () => mainWindow.webContents.send("menu-recent")
    }, {
      label: "保存",
      accelerator: "CmdOrCtrl+S",
      click: () => mainWindow.webContents.send("menu-save")
    }, {
      label: "另存为",
      accelerator: "CmdOrCtrl+Shift+S",
      click: () => mainWindow.webContents.send("menu-save-as")
    }, {
      type: "separator"
    }, {
      label: "导入文件",
      click: () => mainWindow.webContents.send("menu-import")
    }, {
      label: "导出 Markdown",
      click: () => mainWindow.webContents.send("menu-export-md")
    }, {
      label: "导出 HTML",
      click: () => mainWindow.webContents.send("menu-export-html")
    }, {
      label: "导出 PDF",
      click: () => mainWindow.webContents.send("menu-export-pdf")
    }, {
      type: "separator"
    }, {
      label: "退出",
      accelerator: "CmdOrCtrl+Q",
      click: () => {
        isQuitting = true, app.quit();
      }
    } ]
  }, {
    label: "编辑",
    submenu: [ {
      role: "undo",
      label: "撤销"
    }, {
      role: "redo",
      label: "重做"
    }, {
      type: "separator"
    }, {
      role: "cut",
      label: "剪切"
    }, {
      role: "copy",
      label: "复制"
    }, {
      role: "paste",
      label: "粘贴"
    }, {
      role: "selectAll",
      label: "全选"
    } ]
  }, {
    label: "视图",
    submenu: [ {
      label: "切换主题",
      accelerator: "CmdOrCtrl+Shift+T",
      click: () => mainWindow.webContents.send("menu-toggle-theme")
    }, {
      label: "切换视图模式",
      accelerator: "CmdOrCtrl+\\",
      click: () => mainWindow.webContents.send("menu-toggle-view")
    }, {
      type: "separator"
    }, {
      role: "reload",
      label: "刷新"
    }, {
      role: "toggleDevTools",
      label: "开发者工具"
    }, {
      role: "togglefullscreen",
      label: "全屏"
    } ]
  }, {
    label: "模板",
    submenu: [ {
      label: "模板库",
      click: () => mainWindow.webContents.send("menu-templates")
    } ]
  }, {
    label: "设置",
    click: () => mainWindow.webContents.send("menu-settings")
  } ], menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function setupIPC() {
  ipcMain.handle("store-get", (_event, key) => store.get(key)), ipcMain.handle("store-set", (_event, key, value) => store.set(key, value)),
  ipcMain.handle("file-read", async (_event, filePath) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (!isPathSafe(resolvedPath)) return {
        success: false,
        error: "invalid path"
      };
      return {
        success: true,
        content: fs.readFileSync(resolvedPath, "utf-8")
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }), ipcMain.handle("file-save", async (_event, filePath, content) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (!isPathSafe(resolvedPath)) return {
        success: false,
        error: "invalid path"
      };
      const tmpPath = resolvedPath + ".tmp";
      return await fs.promises.writeFile(tmpPath, content, "utf-8"), await fs.promises.rename(tmpPath, resolvedPath),
      {
        success: true
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }), ipcMain.handle("file-rename", async (_event, oldPath, newPath) => {
    try {
      const resolvedOld = path.resolve(oldPath), resolvedNew = path.resolve(newPath);
      return oldPath && newPath ? resolvedOld === resolvedNew ? {
        success: true,
        newPath: resolvedNew
      } : !isPathSafe(resolvedOld) || !isPathSafe(resolvedNew) ? {
        success: false,
        error: "invalid path"
      } : fs.existsSync(resolvedNew) ? {
        success: false,
        error: "target exists"
      } : (await fs.promises.rename(resolvedOld, resolvedNew), {
        success: true,
        newPath: resolvedNew
      }) : {
        success: false,
        error: "invalid path"
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }), ipcMain.handle("image-save", async (_event, {baseDir, fileName, dataBase64, imageDir}) => {
    try {
      const rawDir = imageDir && String(imageDir).trim() || "assets";
      // (1) 绝对路径：用 isPathSafe 校验；相对路径：禁止 .. 穿越
      if (path.isAbsolute(rawDir)) {
        if (!isPathSafe(rawDir)) return { success: false, error: "invalid imageDir path" };
      } else {
        if (rawDir.includes("..")) return { success: false, error: "invalid imageDir path" };
      }
      const isAbsolute = path.isAbsolute(rawDir);
      let saveDir;
      saveDir = isAbsolute ? rawDir : baseDir ? path.join(path.resolve(baseDir), rawDir) : path.join(app.getPath("userData"), "pasted-images"),
      fs.existsSync(saveDir) || fs.mkdirSync(saveDir, {
        recursive: true
      });
      // (2) 对 fileName 做路径穿越过滤（移除 .. 和 / \ 等路径分隔符）
      let safeName = fileName ? fileName.replace(/[/\\]/g, "_").replace(/\.\./g, "").replace(/^\.+/, "") : "image.png";
      let fullPath = path.join(saveDir, safeName), counter = 1;
      for (;fs.existsSync(fullPath); ) {
        const ext = path.extname(safeName), base = path.basename(safeName, ext);
        safeName = `${base}-${counter}${ext}`, fullPath = path.join(saveDir, safeName), counter++;
      }
      // (3) 对最终文件路径做 isPathSafe 检查
      if (!isPathSafe(fullPath)) return { success: false, error: "invalid final path" };
      const imgBuffer = Buffer.from(dataBase64, "base64"), b0 = imgBuffer[0], b1 = imgBuffer[1], b2 = imgBuffer[2], b3 = imgBuffer[3];
      // 校验图片魔数：PNG(89 50 4E 47), JPEG(FF D8 FF), GIF(47 49 46), WEBP(52 49 46 46 ... 57 45 42 50), BMP(42 4D)
      if (!(137 === b0 && 80 === b1 && 78 === b2 && 71 === b3 || 255 === b0 && 216 === b1 && 255 === b2 || 71 === b0 && 73 === b1 && 70 === b2 || 82 === b0 && 73 === b1 && 70 === b2 && 70 === b3 && 87 === imgBuffer[8] && 69 === imgBuffer[9] && 66 === imgBuffer[10] && 80 === imgBuffer[11] || 66 === b0 && 77 === b1)) return {
        success: false,
        error: "invalid image data"
      };
      await fs.promises.writeFile(fullPath, imgBuffer);
      return {
        success: true,
        relPath: !isAbsolute && baseDir ? path.relative(baseDir, fullPath).replace(/\\/g, "/") : "file:///" + fullPath.replace(/\\/g, "/"),
        absPath: fullPath
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }), ipcMain.handle("dialog-open-file", async () => await dialog.showOpenDialog(mainWindow, {
    properties: [ "openFile" ],
    filters: [ {
      name: "Markdown",
      extensions: [ "md", "markdown", "mdown", "mkdn", "mkd", "mdwn", "txt" ]
    }, {
      name: "所有文件",
      extensions: [ "*" ]
    } ]
  })), ipcMain.handle("dialog-save-file", async (_event, opts) => {
    const defaultName = opts.defaultPath || "";
    const resolvedPath = defaultName.includes("/") || defaultName.includes("\\") ? defaultName : path.join(app.getPath("documents"), defaultName);
    return await dialog.showSaveDialog(mainWindow, {
      defaultPath: resolvedPath,
      filters: opts.filters || [ {
        name: "Markdown",
        extensions: [ "md" ]
      } ]
    });
  }), ipcMain.handle("dialog-select-dir", async () => await dialog.showOpenDialog(mainWindow, {
    properties: [ "openDirectory", "createDirectory" ]
  })), ipcMain.handle("export-pdf", async (_event, savePath) => {
    try {
      const pdfBuffer = await mainWindow.webContents.printToPDF({
        marginsType: 0,
        printBackground: true,
        pageSize: "A4"
      });
      return fs.writeFileSync(savePath, pdfBuffer), {
        success: true
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }), ipcMain.handle("shell-show-item", (_event, itemPath) => {
    shell.showItemInFolder(itemPath);
  }), ipcMain.handle("clear-cache", async () => {
    // 冷却保护：防止意外频繁调用
    const now = Date.now();
    if (global.__clearCacheCooldown && now - global.__clearCacheCooldown < 3000) return { success: false, error: "too frequent" };
    global.__clearCacheCooldown = now;
    try {
      const {session} = require("electron"), defaultSession = session.defaultSession, cacheSize = await defaultSession.getCacheSize().catch(() => 0);
      return await defaultSession.clearCache(), await defaultSession.clearStorageData({
        storages: [ "cookies", "filesystem", "indexdb", "shadercache", "websql", "serviceworkers", "cachestorage" ]
      }), {
        success: true,
        freed: cacheSize
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }), ipcMain.handle("focus-window", () => {
    mainWindow && ("win32" === process.platform && mainWindow.blur(), mainWindow.focus(),
    mainWindow.webContents.focus());
  }), ipcMain.handle("update-titlebar", (_event, {color, symbolColor}) => {
    if (mainWindow && "win32" === process.platform && mainWindow.setTitleBarOverlay) try {
      mainWindow.setTitleBarOverlay({
        color: color,
        symbolColor: symbolColor,
        height: 46
      });
    } catch (_) {}
  }), ipcMain.handle("win-minimize", () => mainWindow && mainWindow.minimize()), ipcMain.handle("win-toggle-maximize", () => !!mainWindow && (mainWindow.isMaximized() ? (mainWindow.unmaximize(),
  false) : (mainWindow.maximize(), true))), ipcMain.handle("win-close", () => mainWindow && mainWindow.close()),
  ipcMain.handle("win-is-maximized", () => !!mainWindow && mainWindow.isMaximized()),
  ipcMain.handle("has-pending-file", () => pendingOSFile)
}

const gotTheLock = app.requestSingleInstanceLock();

gotTheLock ? (app.on("second-instance", (_event, argv) => {
  const fileArg = extractFileArg(argv);
  console.log("[second-instance] argv:", argv, "extracted:", fileArg);
  fileArg && sendOpenFile(fileArg), mainWindow && (mainWindow.isMinimized() && mainWindow.restore(),
  mainWindow.isVisible() || mainWindow.show(), mainWindow.focus());
}), app.on("open-file", (_event, filePath) => {
  _event.preventDefault(), mainWindow ? sendOpenFile(filePath) : (pendingOpenFile = filePath, pendingOSFile = true);
}), app.whenReady().then(() => {
  pendingOpenFile = extractFileArg(process.argv), pendingOSFile = !!pendingOpenFile, setupIPC(), createWindow();
})) : app.quit(), app.on("window-all-closed", () => {
  "darwin" !== process.platform && app.quit();
}), app.on("before-quit", () => {
  isQuitting = true;
}), app.on("activate", () => {
  0 === BrowserWindow.getAllWindows().length && createWindow();
});
