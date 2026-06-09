const {app: app, BrowserWindow: BrowserWindow, ipcMain: ipcMain, dialog: dialog, shell: shell, Menu: Menu, Tray: Tray, nativeImage: nativeImage} = require("electron"), path = require("path"), fs = require("fs");

function isPathSafe(e) {
  try {
    if (!e || "string" != typeof e) return !1;
    // 先检查原始输入是否为绝对路径
    if (!path.isAbsolute(e)) return !1;
    const t = path.resolve(e);
    if (!path.isAbsolute(t)) return !1;
    // 检查 .. 穿越：resolve 后原路径仍包含 .. 则拒绝
    if (e.includes("..")) {
      const normalized = path.normalize(e);
      if (normalized !== t || e.split(path.sep).some(p => ".." === p)) return !1;
    }
    if (process.platform.startsWith("win")) {
      const n = t.toUpperCase();
      if (n.startsWith("\\\\?\\") || n.startsWith("\\\\.\\") || /^[A-Z]:\\\\(?:NUL|CON|PRN|AUX|COM\d+|LPT\d+)(?:\.|$)/i.test(t)) return !1;
    }
    // 检查符号链接：只检查路径末端（或父目录）是否为直接符号链接
    // 用 lstatSync 判断：如果文件存在且是 symlink 则拒绝；
    // 如果文件不存在（保存新文件），检查父目录是否安全即可
    try {
      const stat = fs.lstatSync(t);
      if (stat.isSymbolicLink()) return !1;
    } catch (_) {
      // 文件不存在：检查父目录是否存在且不是符号链接
      try {
        const dir = path.dirname(t);
        const dirStat = fs.lstatSync(dir);
        if (dirStat.isSymbolicLink()) return !1;
      } catch (_2) {
        return !1;  // 父目录也不存在，不安全
      }
    }
    return !0;
  } catch {
    return !1;
  }
}

let Store, store, mainWindow, tray = null, isQuitting = !1;

async function initStore() {
  const {default: e} = await import("electron-store");
  Store = e, store = new Store({
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

let pendingOpenFile = null;

function extractFileArg(e) {
  if (!e || 0 === e.length) return null;
  for (let n = 1; n < e.length; n++) {
    const i = e[n];
    if (i && !i.startsWith("-") && "." !== i && !i.endsWith(".js") && /\.(md|markdown|txt)$/i.test(i)) try {
      if (fs.existsSync(i)) return path.resolve(i);
    } catch (e) {}
  }
  return null;
}

function sendOpenFile(e) {
  if (e && mainWindow) try {
    const n = fs.readFileSync(e, "utf-8"), i = path.basename(e);
    mainWindow.webContents.send("open-file-from-os", {
      filePath: e,
      content: n,
      name: i
    });
  } catch (e) {
    console.error("open-file-from-os failed:", e);
  }
}

async function createWindow() {
  await initStore();
  const {width: e, height: n} = store.get("windowBounds"), i = path.join(__dirname, "../assets/icons/icon.ico"), a = "darwin" === process.platform;
  mainWindow = new BrowserWindow({
    width: e,
    height: n,
    minWidth: 800,
    minHeight: 600,
    icon: fs.existsSync(i) ? i : void 0,
    frame: a,
    titleBarStyle: a ? "hiddenInset" : void 0,
    trafficLightPosition: a ? {
      x: 14,
      y: 16
    } : void 0,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1
    },
    backgroundColor: "#0a0a0c",
    show: !1
  }), mainWindow.loadFile(app && app.isPackaged ? path.join(__dirname, "../index.html") : path.join(__dirname, "../dist/index.html")), 
  mainWindow.once("ready-to-show", () => {
    mainWindow.show(), app.isPackaged || mainWindow.webContents.openDevTools({
      mode: "detach"
    });
  }), mainWindow.webContents.on("did-finish-load", () => {
    pendingOpenFile && (sendOpenFile(pendingOpenFile), pendingOpenFile = null);
  }), mainWindow.on("resize", () => {
    const [e, n] = mainWindow.getSize();
    store.set("windowBounds", {
      width: e,
      height: n
    });
  }), mainWindow.on("maximize", () => mainWindow.webContents.send("win-maximized", !0)), 
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("win-maximized", !1)), 
  mainWindow.on("close", e => {
    if (!isQuitting) {
      // 窗口关闭时同步保存缓存
      mainWindow.webContents.executeJavaScript("typeof CacheManager!=='undefined'&&CacheManager.saveAll()").catch(() => {});
      return e.preventDefault(), mainWindow.hide(), !1;
    }
  }), setupTray(), setupMenu();
}

function setupTray() {
  if (tray) return;
  const isWin = "win32" === process.platform;
  const iconName = isWin ? "icon.ico" : "icon.png";
  const e = path.join(__dirname, "../assets/icons/" + iconName), n = fs.existsSync(e) ? nativeImage.createFromPath(e) : nativeImage.createEmpty();
  if (!isWin) n.setTemplateImage(!0);
  tray = new Tray(n), tray.setToolTip("Markdown Editor");
  const i = () => {
    mainWindow && (mainWindow.isMinimized() && mainWindow.restore(), mainWindow.show(), 
    mainWindow.focus());
  }, a = Menu.buildFromTemplate([ {
    label: "显示 Markdown Editor",
    click: i
  }, {
    type: "separator"
  }, {
    label: "退出",
    click: () => {
      isQuitting = !0, app.quit();
    }
  } ]);
  tray.setContextMenu(a), tray.on("click", i), tray.on("double-click", i);
}

function setupMenu() {
  const e = [ {
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
        isQuitting = !0, app.quit();
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
  } ], n = Menu.buildFromTemplate(e);
  Menu.setApplicationMenu(n);
}

function setupIPC() {
  ipcMain.handle("store-get", (e, n) => store.get(n)), ipcMain.handle("store-set", (e, n, i) => store.set(n, i)), 
  ipcMain.handle("file-read", async (e, n) => {
    try {
      const t = path.resolve(n);
      if (!isPathSafe(t)) return {
        success: !1,
        error: "invalid path"
      };
      return {
        success: !0,
        content: fs.readFileSync(t, "utf-8")
      };
    } catch (e) {
      return {
        success: !1,
        error: e.message
      };
    }
  }), ipcMain.handle("file-save", async (e, n, i) => {
    try {
      const t = path.resolve(n);
      if (!isPathSafe(t)) return {
        success: !1,
        error: "invalid path"
      };
      const e = t + ".tmp";
      return await fs.promises.writeFile(e, i, "utf-8"), await fs.promises.rename(e, t), 
      {
        success: !0
      };
    } catch (e) {
      return {
        success: !1,
        error: e.message
      };
    }
  }), ipcMain.handle("file-rename", async (e, n, i) => {
    try {
      const t = path.resolve(n), e = path.resolve(i);
      return n && i ? t === e ? {
        success: !0,
        newPath: e
      } : !isPathSafe(t) || !isPathSafe(e) ? {
        success: !1,
        error: "invalid path"
      } : fs.existsSync(e) ? {
        success: !1,
        error: "target exists"
      } : (await fs.promises.rename(t, e), {
        success: !0,
        newPath: e
      }) : {
        success: !1,
        error: "invalid path"
      };
    } catch (e) {
      return {
        success: !1,
        error: e.message
      };
    }
  }), ipcMain.handle("image-save", async (e, {baseDir: n, fileName: i, dataBase64: a, imageDir: t}) => {
    try {
      const rawDir = t && String(t).trim() || "assets";
      if (rawDir.includes("..")) return {
        success: !1,
        error: "invalid imageDir path"
      };
      const o = path.isAbsolute(rawDir);
      let s;
      s = o ? rawDir : n ? path.join(path.resolve(n), rawDir) : path.join(app.getPath("userData"), "pasted-images"), 
      fs.existsSync(s) || fs.mkdirSync(s, {
        recursive: !0
      });
      let r = i, l = path.join(s, r), c = 1;
      for (;fs.existsSync(l); ) {
        const ext = path.extname(i), base = path.basename(i, ext);
        r = `${base}-${c}${ext}`, l = path.join(s, r), c++;
      }
      const d = Buffer.from(a, "base64"), u = d[0], m = d[1], g = d[2], p = d[3];
      if (!(137 === u && 80 === m && 78 === g && 71 === p || 255 === u && 216 === m && 255 === g || 71 === u && 73 === m && 70 === g || 82 === u && 73 === m && 70 === g && 70 === p && 87 === d[8] && 69 === d[9] && 66 === d[10] && 80 === d[11] || 66 === u && 77 === m)) return {
        success: !1,
        error: "invalid image data"
      };
      return fs.writeFileSync(l, d), {
        success: !0,
        relPath: !o && n ? path.relative(n, l).replace(/\\/g, "/") : "file:///" + l.replace(/\\/g, "/"),
        absPath: l
      };
    } catch (e) {
      return {
        success: !1,
        error: e.message
      };
    }
  }), ipcMain.handle("dialog-open-file", async () => await dialog.showOpenDialog(mainWindow, {
    properties: [ "openFile" ],
    filters: [ {
      name: "Markdown",
      extensions: [ "md", "markdown", "txt" ]
    }, {
      name: "所有文件",
      extensions: [ "*" ]
    } ]
  })), ipcMain.handle("dialog-save-file", async (e, n) => {
    const i = n.defaultPath || "";
    const a = i.includes("/") || i.includes("\\") ? i : path.join(app.getPath("documents"), i);
    return await dialog.showSaveDialog(mainWindow, {
      defaultPath: a,
      filters: n.filters || [ {
        name: "Markdown",
        extensions: [ "md" ]
      } ]
    });
  }), ipcMain.handle("dialog-select-dir", async () => await dialog.showOpenDialog(mainWindow, {
    properties: [ "openDirectory", "createDirectory" ]
  })), ipcMain.handle("export-pdf", async (e, n) => {
    try {
      const e = await mainWindow.webContents.printToPDF({
        marginsType: 0,
        printBackground: !0,
        pageSize: "A4"
      });
      return fs.writeFileSync(n, e), {
        success: !0
      };
    } catch (e) {
      return {
        success: !1,
        error: e.message
      };
    }
  }), ipcMain.handle("shell-show-item", (e, n) => {
    shell.showItemInFolder(n);
  }), ipcMain.handle("clear-cache", async () => {
    // 冷却保护：防止意外频繁调用
    const now = Date.now();
    if (global.__clearCacheCooldown && now - global.__clearCacheCooldown < 3000) return { success: !1, error: "too frequent" };
    global.__clearCacheCooldown = now;
    try {
      const {session: e} = require("electron"), n = e.defaultSession, i = await n.getCacheSize().catch(() => 0);
      return await n.clearCache(), await n.clearStorageData({
        storages: [ "cookies", "filesystem", "indexdb", "shadercache", "websql", "serviceworkers", "cachestorage" ]
      }), {
        success: !0,
        freed: i
      };
    } catch (e) {
      return {
        success: !1,
        error: e.message
      };
    }
  }), ipcMain.handle("focus-window", () => {
    mainWindow && ("win32" === process.platform && mainWindow.blur(), mainWindow.focus(), 
    mainWindow.webContents.focus());
  }), ipcMain.handle("update-titlebar", (e, {color: n, symbolColor: i}) => {
    if (mainWindow && "win32" === process.platform && mainWindow.setTitleBarOverlay) try {
      mainWindow.setTitleBarOverlay({
        color: n,
        symbolColor: i,
        height: 46
      });
    } catch (e) {}
  }), ipcMain.handle("win-minimize", () => mainWindow && mainWindow.minimize()), ipcMain.handle("win-toggle-maximize", () => !!mainWindow && (mainWindow.isMaximized() ? (mainWindow.unmaximize(), 
  !1) : (mainWindow.maximize(), !0))), ipcMain.handle("win-close", () => mainWindow && mainWindow.close()), 
  ipcMain.handle("win-is-maximized", () => !!mainWindow && mainWindow.isMaximized());
}

const gotTheLock = app.requestSingleInstanceLock();

gotTheLock ? (app.on("second-instance", (e, n) => {
  const i = extractFileArg(n);
  i && sendOpenFile(i), mainWindow && (mainWindow.isMinimized() && mainWindow.restore(), 
  mainWindow.isVisible() || mainWindow.show(), mainWindow.focus());
}), app.on("open-file", (e, n) => {
  e.preventDefault(), mainWindow ? sendOpenFile(n) : pendingOpenFile = n;
}), app.whenReady().then(() => {
  pendingOpenFile = extractFileArg(process.argv), setupIPC(), createWindow();
})) : app.quit(), app.on("window-all-closed", () => {
  "darwin" !== process.platform && app.quit();
}), app.on("before-quit", () => {
  isQuitting = !0;
  mainWindow && mainWindow.webContents.executeJavaScript("typeof CacheManager!=='undefined'&&CacheManager.saveAll()").catch(() => {});  // before-quit: best-effort cache flush
}), app.on("activate", () => {
  0 === BrowserWindow.getAllWindows().length && createWindow();
});