(async function () {
  if (window.api && window.api.platform === 'darwin') {
    document.body.classList.add('platform-mac')
  }
  const editorContainer = document.getElementById('editor-container')
  EditorManager.init(editorContainer)
  const settings = await SettingsManager.load()
  SettingsManager.applyTheme(settings.theme)
  SettingsManager.applyFontSize(settings.fontSize)
  SettingsManager.applyEditorFont(settings.editorFont)
  PreviewManager.init()
  TemplateManager.init()
  SettingsManager.init()
  if (window.FindManager) FindManager.init()
  if (window.RecentFiles) await RecentFiles.init()

  TemplateManager.onApply(async (content, name) => {
    const tab = TabManager.getActive()
    if (!tab) return
    const cur = EditorManager.getValue()
    if (cur.trim().length > 0 && name !== '空白文档') {
      const ok = await window.showConfirm(`当前标签页已有内容,是否覆盖?\n取消则在新标签页打开`, {
        title: '应用模板',
        okText: '覆盖',
        cancelText: '新标签页',
      })
      if (!ok) {
        const newTab = TabManager.createTab({ title: name, content: content })
        TabManager.setActive(newTab.id)
        PreviewManager.render(content)
        requestAnimationFrame(() => EditorManager.focus())
        return
      }
    }
    EditorManager.setValue(content)
    TabManager.setTabTitle(tab.id, name)
    TabManager.markModified(tab.id, content.length > 0)
    PreviewManager.render(content)
    requestAnimationFrame(() => EditorManager.focus())
  })

  let hasPendingFile = window.api && window.api.hasPendingFile ? await window.api.hasPendingFile() : false
  const cache = hasPendingFile ? false : await CacheManager.checkAndRestore()
  let restored = false
  if (cache) {
    await CacheManager.restore(cache)
    // 缓存恢复后，应用持久化的 tab 拖拽排序
    TabManager.loadOrder && TabManager.loadOrder()
    restored = true
  }
  if (!restored) {
    const tab = TabManager.createTab({ title: '未命名' })
    TabManager.setActive(tab.id)
  }
  requestAnimationFrame(() => updateWelcomeVisibility())
  await CacheManager.loadInterval()
  CacheManager.start()

  let changeTimer = null
  let autoSaveTimer = null
  let pendingAutoSaveTabId = null
  let welcomeDismissed = false  // 用户主动操作后不再显示欢迎页

  function updateStatusStats(value, wordCount) {
    const text = value || ''
    const charsAll = text.length
    const charsNoSpace = text.replace(/\s/g, '').length
    const chEl = document.getElementById('status-chars')
    const chSep = document.getElementById('status-chars-sep')
    if (chEl) {
      if (charsAll > 0) {
        chEl.textContent = `${charsAll} 字符（不含空白 ${charsNoSpace}）`
        if (chSep) chSep.style.display = ''
      } else {
        chEl.textContent = ''
        if (chSep) chSep.style.display = 'none'
      }
    }
    const rtEl = document.getElementById('status-readtime')
    const rtSep = document.getElementById('status-readtime-sep')
    if (rtEl) {
      const wc = wordCount != null ? wordCount : EditorManager.getWordCount(value)
      if (wc > 0) {
        const minutes = Math.max(1, Math.ceil(wc / 300))
        rtEl.textContent = `约 ${minutes} 分钟阅读`
        if (rtSep) rtSep.style.display = ''
      } else {
        rtEl.textContent = ''
        if (rtSep) rtSep.style.display = 'none'
      }
    }
  }

  function updateWelcomeVisibility() {
    const overlay = document.getElementById('welcome-overlay')
    if (!overlay) return
    // 用户已主动操作过（新建/打开文件、输入内容），不再显示欢迎页
    if (welcomeDismissed) {
      overlay.classList.add('hidden')
      return
    }
    const tabs = TabManager.getAllTabs()
    // 只有在没有任何标签，或唯一标签是空白未保存时才显示欢迎页
    if (
      tabs.length === 0 ||
      (tabs.length === 1 &&
        (() => {
          const active = TabManager.getActive()
          return (
            active &&
            !active.filePath &&
            !active.modified &&
            (!EditorManager.getValue() || EditorManager.getValue().length === 0)
          )
        })())
    ) {
      overlay.classList.remove('hidden')
    } else {
      overlay.classList.add('hidden')
      welcomeDismissed = true
    }
  }

  async function autoSaveToFile() {
    if (window.__isSaving) return
    window.__isSaving = true
    const tabId = pendingAutoSaveTabId
    pendingAutoSaveTabId = null
    if (!tabId) { window.__isSaving = false; return }
    const tab = TabManager.getTab(tabId)
    if (!tab || !tab.filePath || !tab.modified) { window.__isSaving = false; return }
    const content = tab.doc ? tab.doc.getValue() : ''
    // 使用持久化锁防止与缓存写入同时进行
    if (window.CacheManager && CacheManager.acquirePersistLock) {
      await CacheManager.acquirePersistLock()
    }
    try {
      const result = await window.api.fileSave(tab.filePath, content)
      if (result.success) {
        TabManager.markModified(tab.id, false)
        const el = document.getElementById('status-autosave')
        const sep = document.getElementById('status-autosave-sep')
        if (el) {
          const now = new Date()
          el.textContent = `已保存 ${now.toLocaleTimeString('zh-CN', { hour12: false })}`
          if (sep) sep.style.display = ''
        }
      }
    } finally {
      if (window.CacheManager && CacheManager.releasePersistLock) {
        CacheManager.releasePersistLock()
      }
      window.__isSaving = false
    }
  }

  EditorManager.onChange(value => {
    const wc = EditorManager.getWordCount(value)
    document.getElementById('word-count').textContent = `${wc} 字`
    CacheManager.markDirty()
    updateStatusStats(value, wc)
    // 使用 trailing-debounce 代替 rAF 节流，用户停止输入后再渲染预览
    clearTimeout(changeTimer)
    const delay = value.length > 5e3 ? 1200 : value.length > 2e3 ? 800 : 300
    changeTimer = setTimeout(() => {
      PreviewManager.render(value)
    }, delay)
    const tab = TabManager.getActive()
    if (tab && !tab.modified) {
      TabManager.markModified(tab.id, true)
    }
    if (tab && tab.filePath) {
      pendingAutoSaveTabId = tab.id
      clearTimeout(autoSaveTimer)
      autoSaveTimer = setTimeout(autoSaveToFile, 1500)
    }
    updateWelcomeVisibility()
  })

  TabManager.onSwitch(tab => {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer)
      autoSaveTimer = null
      autoSaveToFile()
    }
    if (changeTimer) {
      clearTimeout(changeTimer)
      changeTimer = null
    }
    const value = EditorManager.getValue()
    const wc = EditorManager.getWordCount(value)
    const wcEl = document.getElementById('word-count')
    if (wcEl) wcEl.textContent = `${wc} 字`
    updateStatusStats(value, wc)
    PreviewManager.render(value)
    updateWelcomeVisibility()
    CacheManager.markDirty()
  })

  let panesSwapped = false

  async function initPaneOrder() {
    let order
    try {
      order = await window.api.storeGet('paneOrder')
    } catch (_err) {
      order = null
    }
    if (order === 'editor-first') {
      applyPaneSwap(false, false)
    } else {
      applyPaneSwap(true, false)
    }
  }

  function applyPaneSwap(swapped, notify = true) {
    panesSwapped = swapped
    const mainArea = document.getElementById('main-area')
    const editorPane = document.getElementById('editor-pane')
    const divider = document.getElementById('divider')
    const previewPane = document.getElementById('preview-pane')
    if (swapped) {
      mainArea.appendChild(previewPane)
      mainArea.appendChild(divider)
      mainArea.appendChild(editorPane)
    } else {
      mainArea.appendChild(editorPane)
      mainArea.appendChild(divider)
      mainArea.appendChild(previewPane)
    }
    const btn = document.getElementById('btn-swap-panes')
    if (btn) btn.classList.toggle('active', !swapped)
    window.api.storeSet('paneOrder', swapped ? 'preview-first' : 'editor-first')
    if (notify) {
      ExportManager.showToast(swapped ? '预览在左，编辑在右' : '编辑在左，预览在右')
    }
  }

  function togglePaneSwap() {
    applyPaneSwap(!panesSwapped)
  }

  await initPaneOrder()
  document.getElementById('btn-swap-panes').addEventListener('click', togglePaneSwap)

  // Divider drag
  const divider = document.getElementById('divider')
  const mainArea = document.getElementById('main-area')
  let isDragging = false
  let startX, startLeftWidth
  divider.addEventListener('mousedown', evt => {
    isDragging = true
    startX = evt.clientX
    const leftPane = divider.previousElementSibling
    startLeftWidth = leftPane.getBoundingClientRect().width
    divider.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    evt.preventDefault()
  })
  document.addEventListener('mousemove', evt => {
    if (!isDragging) return
    const delta = evt.clientX - startX
    const totalWidth = mainArea.getBoundingClientRect().width - 4
    const newLeftWidth = Math.max(200, Math.min(totalWidth - 200, startLeftWidth + delta))
    const leftPane = divider.previousElementSibling
    const rightPane = divider.nextElementSibling
    leftPane.style.flex = 'none'
    leftPane.style.width = newLeftWidth + 'px'
    rightPane.style.flex = '1'
    rightPane.style.width = ''
  })
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false
      divider.classList.remove('dragging')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const leftPane = divider.previousElementSibling
      const w = leftPane.getBoundingClientRect().width
      window.api.storeSet('dividerPos', w)
    }
  })
  ;(async () => {
    const saved = await window.api.storeGet('dividerPos')
    if (saved != null) {
      const leftPane = divider.previousElementSibling
      const rightPane = divider.nextElementSibling
      leftPane.style.flex = 'none'
      leftPane.style.width = saved + 'px'
      rightPane.style.flex = '1'
      rightPane.style.width = ''
    }
  })()

  // View mode toggle
  let viewMode = 'split'
  const viewToggleBtn = document.getElementById('btn-view-toggle')
  const viewModes = ['split', 'editor', 'preview']
  const viewSVGs = {
    split: `<rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/>`,
    editor: `<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="8" y1="3" x2="8" y2="21" opacity="0.3"/>`,
    preview: `<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="16" y1="3" x2="16" y2="21" opacity="0.3"/>`,
  }

  function setViewMode(mode) {
    viewMode = mode
    mainArea.classList.remove('view-editor-only', 'view-preview-only')
    if (mode === 'editor') mainArea.classList.add('view-editor-only')
    if (mode === 'preview') mainArea.classList.add('view-preview-only')
    const icon = viewToggleBtn.querySelector('svg')
    if (icon) icon.innerHTML = viewSVGs[mode]
    const titles = {
      split: '分栏视图 (Ctrl+\\)',
      editor: '仅编辑 (Ctrl+\\)',
      preview: '仅预览 (Ctrl+\\)',
    }
    viewToggleBtn.title = titles[mode]
  }

  viewToggleBtn.addEventListener('click', () => {
    const idx = viewModes.indexOf(viewMode)
    setViewMode(viewModes[(idx + 1) % viewModes.length])
  })

  // Tab buttons
  const btnTabNew = document.getElementById('btn-tab-new')
  btnTabNew.addEventListener('mousedown', evt => evt.preventDefault())
  btnTabNew.addEventListener('click', () => {
    const tab = TabManager.createTab({ title: '未命名' })
    TabManager.setActive(tab.id)
    EditorManager.focus()
  })
  TabManager.onClose(() => {
    if (window.__allTabsClosed) {
      welcomeDismissed = false
      window.__allTabsClosed = false
    }
    updateWelcomeVisibility()
  })

  // Welcome page
  const welcomeNew = document.getElementById('welcome-new')
  const welcomeOpen = document.getElementById('welcome-open')
  const welcomeTemplate = document.getElementById('welcome-template')
  if (welcomeNew) welcomeNew.addEventListener('click', () => newFile())
  if (welcomeOpen) welcomeOpen.addEventListener('click', () => openFile())
  if (welcomeTemplate) welcomeTemplate.addEventListener('click', () => TemplateManager.open())

  // Toolbar buttons
  const btnNew = document.getElementById('btn-new')
  btnNew.addEventListener('mousedown', evt => evt.preventDefault())
  btnNew.addEventListener('click', () => newFile())
  document.getElementById('btn-open').addEventListener('click', () => openFile())
  document.getElementById('btn-save').addEventListener('click', () => saveFile())
  document.getElementById('btn-template').addEventListener('click', () => TemplateManager.open())
  document.getElementById('btn-theme').addEventListener('click', () => SettingsManager.toggleTheme())
  document.getElementById('btn-settings').addEventListener('click', () => SettingsManager.open())
  document.getElementById('status-palette-hint').addEventListener('click', () => CommandPalette?.open?.())

  // Format buttons
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      EditorManager.insertFormat(btn.dataset.action)
    })
  })

  // Export menu
  const exportBtn = document.getElementById('btn-export')
  const exportMenu = document.getElementById('export-menu')
  exportBtn.addEventListener('click', evt => {
    evt.stopPropagation()
    exportMenu.classList.toggle('open')
  })
  document.addEventListener('click', () => exportMenu.classList.remove('open'))
  document.querySelectorAll('.export-item').forEach(item => {
    item.addEventListener('click', () => {
      exportMenu.classList.remove('open')
      const type = item.dataset.type
      const content = EditorManager.getValue()
      if (type === 'md') ExportManager.exportMd(content)
      else if (type === 'html') ExportManager.exportHtml(content)
      else if (type === 'pdf') ExportManager.exportPdf(content)
      else if (type === 'settings') SettingsManager.open()
    })
  })

  function newFile(templateContent) {
    const tab = TabManager.createTab({ title: '未命名', content: templateContent || '' })
    TabManager.setActive(tab.id)
    welcomeDismissed = true
    // 强制隐藏欢迎页覆盖层，避免阻挡编辑器交互
    document.getElementById('welcome-overlay')?.classList.add('hidden')
    EditorManager.focus()
  }

  async function openFile() {
    const result = await ExportManager.importFile()
    if (!result) return
    const { filePath, content, name } = result
    const title = name.replace(/\.(md|markdown|mdown|mkdn|mkd|mdwn|txt)$/i, '')
    // 关闭当前的空白草稿标签
    const cur = TabManager.getActive()
    const curIsBlankDraft =
      cur && !cur.filePath && !cur.modified &&
      (!EditorManager.getValue() || EditorManager.getValue().trim() === '')
    const tab = TabManager.createTab({ title: title, filePath: filePath, content: content })
    TabManager.setActive(tab.id)
    TabManager.markModified(tab.id, false)
    CacheManager.markDirty()
    PreviewManager.render(content)
    if (window.RecentFiles) await RecentFiles.add(filePath)
    if (curIsBlankDraft) {
      await TabManager.closeTab(cur.id)
    }
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur()
    }
    if (window.api && window.api.focusWindow) {
      await window.api.focusWindow()
    }
    welcomeDismissed = true
    document.getElementById('welcome-overlay')?.classList.add('hidden')
    EditorManager.focus()
    requestAnimationFrame(() => EditorManager.focus())
  }

  async function openFileByPath(filePath) {
    if (!filePath) return
    const existed = TabManager.getAllTabs().find(t => t.filePath === filePath)
    if (existed) {
      TabManager.setActive(existed.id)
      EditorManager.focus()
      return
    }
    const readResult = await window.api.fileRead(filePath)
    if (!readResult.success) {
      ExportManager.showToast('打开失败：' + readResult.error, 'error')
      if (window.RecentFiles) await RecentFiles.remove(filePath)
      return
    }
    const name = filePath.split(/[/\\]/).pop()
    const title = name.replace(/\.(md|markdown|mdown|mkdn|mkd|mdwn|txt)$/i, '')
    // 关闭当前的空白草稿标签（未命名、未修改、无路径）
    const cur = TabManager.getActive()
    const curIsBlankDraft =
      cur && !cur.filePath && !cur.modified &&
      (!EditorManager.getValue() || EditorManager.getValue().trim() === '')
    const tab = TabManager.createTab({ title: title, filePath: filePath, content: readResult.content })
    TabManager.setActive(tab.id)
    TabManager.markModified(tab.id, false)
    CacheManager.markDirty()
    PreviewManager.render(readResult.content)
    if (window.RecentFiles) await RecentFiles.add(filePath)
    if (curIsBlankDraft) {
      await TabManager.closeTab(cur.id)
    }
    EditorManager.focus()
    welcomeDismissed = true
    // 强制隐藏欢迎页覆盖层
    document.getElementById('welcome-overlay')?.classList.add('hidden')
    EventBus && EventBus.emit('file:opened', { filePath, title })
  }

  async function saveFile(saveAs = false) {
    const tab = TabManager.getActive()
    if (!tab) return
    const content = EditorManager.getValue()
    let filePath = tab.filePath
    if (!filePath || saveAs) {
      const exportDir = (await window.api.storeGet('exportDir')) || ''
      let baseName
      if (tab.title && tab.title !== '未命名') {
        baseName = tab.title.replace(/[\\/:*?"<>|]/g, '_')
      } else {
        const rule = (await window.api.storeGet('exportNamingRule')) || '{title}_{date}'
        baseName = resolveNamingRuleLocal(rule, content)
      }
      const defaultPath = exportDir ? exportDir + '/' + baseName + '.md' : baseName + '.md'
      const result = await window.api.dialogSaveFile({
        defaultPath: defaultPath,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'txt'] }],
      })
      if (result.canceled || !result.filePath) return
      filePath = result.filePath
      const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
      if (dir) window.api.storeSet('exportDir', dir)
    }
    window.__isSaving = true
    try {
      const saveResult = await window.api.fileSave(filePath, content)
      if (saveResult.success) {
        const baseName = filePath.split(/[/\\]/).pop().replace(/\.(md|markdown)$/i, '')
        const titleToUse = tab.filePath && tab.filePath === filePath ? tab.title : baseName
        TabManager.setTabTitle(tab.id, titleToUse, filePath)
        TabManager.markModified(tab.id, false)
        CacheManager.markDirty()
        if (window.RecentFiles) await RecentFiles.add(filePath)
        ExportManager.showToast(`已保存: ${filePath.split(/[/\\]/).pop()}`)
      } else {
        ExportManager.showToast('保存失败: ' + saveResult.error, 'error')
      }
    } finally {
      window.__isSaving = false
    }
  }

  function resolveNamingRuleLocal(rule, content) {
    return window.resolveNamingRule(rule, content)
  }

  // Menu events from main process
  // 菜单事件：来自菜单栏点击或快捷键（IPC）
  // 标记机制：如果快捷键已由渲染层 keydown 处理，跳过 IPC 重复调用
  window.api.onMenuEvent(event => {
    if (window.__menuEventPending > 0) {
      window.__menuEventPending--
      return
    }
    const content = EditorManager.getValue()
    switch (event) {
      case 'menu-new': newFile(); break
      case 'menu-open': openFile(); break
      case 'menu-save': saveFile(); break
      case 'menu-save-as': saveFile(true); break
      case 'menu-import': openFile(); break
      case 'menu-export-md': ExportManager.exportMd(content); break
      case 'menu-export-html': ExportManager.exportHtml(content); break
      case 'menu-export-pdf': ExportManager.exportPdf(content); break
      case 'menu-toggle-theme': SettingsManager.toggleTheme(); break
      case 'menu-toggle-view': {
        const idx = viewModes.indexOf(viewMode)
        setViewMode(viewModes[(idx + 1) % viewModes.length])
        break
      }
      case 'menu-settings': SettingsManager.open(); break
      case 'menu-templates': TemplateManager.open(); break
      case 'menu-recent': if (window.RecentFiles) RecentFiles.open(); break
    }
    // 通过 EventBus 广播菜单事件，供其他模块监听
    EventBus && EventBus.emit('menu:' + event, { content })
  })

  // Handle file open from OS
  if (window.api && window.api.onOpenFileFromOS) {
    window.api.onOpenFileFromOS(async ({ filePath, content, name }) => {
      // 防重标记：同一文件路径已处理过则跳过，避免重复收到 IPC
      if (window._fileOpenedViaOS === filePath) return
      window._fileOpenedViaOS = filePath

      const title = (name || '').replace(/\.(md|markdown|mdown|mkdn|mkd|mdwn|txt)$/i, '') || '未命名'
      const existed = TabManager.getAllTabs().find(t => t.filePath === filePath)
      if (existed) {
        TabManager.setActive(existed.id)
        EditorManager.focus()
        return
      }

      // 仅启动时通过 OS 打开文件才清理所有标签页
      // restored 标志在缓存恢复后保持 true，但不能用于判断后续 OS 文件打开
      if (hasPendingFile) {
        const allTabs = TabManager.getAllTabs()
        for (const t of allTabs) {
          await TabManager.closeTab(t.id)
        }
        hasPendingFile = false  // 消耗标记，后续 OS 文件打开不再误删已有标签
      } else {
        // 情况3：正常打开，仅关闭当前空白草稿标签
        const cur = TabManager.getActive()
        const curIsBlankDraft =
          cur && !cur.filePath && !cur.modified &&
          (!EditorManager.getValue() || EditorManager.getValue().trim() === '')
        if (curIsBlankDraft) {
          await TabManager.closeTab(cur.id)
        }
      }

      const tab = TabManager.createTab({ title: title, filePath: filePath, content: content })
      TabManager.setActive(tab.id)
      TabManager.markModified(tab.id, false)
      PreviewManager.render(content)
      if (window.RecentFiles) await RecentFiles.add(filePath)
      welcomeDismissed = true
      document.getElementById('welcome-overlay')?.classList.add('hidden')
      EditorManager.focus()
    })
  }

  // Listen for 'app:open-file' custom event dispatched by editor.js
  document.addEventListener('app:open-file', (event) => {
    const filePath = event.detail?.filePath
    if (filePath) openFileByPath(filePath)
  })

  // Recent files
  if (window.RecentFiles) {
    RecentFiles.onOpen(async filePath => {
      await openFileByPath(filePath)
    })
  }

  // Command palette
  if (window.CommandPalette) {
    const P = CommandPalette
    P.register({ id: 'file.new', group: '文件', title: '新建', hint: 'Ctrl+N', run: () => newFile() })
    P.register({ id: 'file.open', group: '文件', title: '打开文件...', hint: 'Ctrl+O', run: () => openFile() })
    P.register({ id: 'file.save', group: '文件', title: '保存', hint: 'Ctrl+S', run: () => saveFile() })
    P.register({ id: 'file.saveAs', group: '文件', title: '另存为...', hint: 'Ctrl+Shift+S', run: () => saveFile(true) })
    P.register({ id: 'file.recent', group: '文件', title: '最近文件...', hint: 'Ctrl+Shift+R', run: () => window.RecentFiles && RecentFiles.open() })
    P.register({ id: 'export.md', group: '导出', title: '导出 Markdown', run: () => ExportManager.exportMd(EditorManager.getValue()) })
    P.register({ id: 'export.html', group: '导出', title: '导出 HTML', run: () => ExportManager.exportHtml(EditorManager.getValue()) })
    P.register({ id: 'export.pdf', group: '导出', title: '导出 PDF', run: () => ExportManager.exportPdf(EditorManager.getValue()) })
    P.register({ id: 'view.toggleTheme', group: '视图', title: '切换主题', hint: 'Ctrl+Shift+T', run: () => SettingsManager.toggleTheme() })
    P.register({ id: 'view.toggleMode', group: '视图', title: '循环视图模式', hint: 'Ctrl+\\', run: () => { const idx = viewModes.indexOf(viewMode); setViewMode(viewModes[(idx + 1) % viewModes.length]) } })
    P.register({ id: 'view.editorOnly', group: '视图', title: '仅编辑器', run: () => setViewMode('editor') })
    P.register({ id: 'view.previewOnly', group: '视图', title: '仅预览', run: () => setViewMode('preview') })
    P.register({ id: 'view.split', group: '视图', title: '分栏视图', run: () => setViewMode('split') })
    P.register({ id: 'view.swapPanes', group: '视图', title: '互换编辑/预览位置', hint: 'Ctrl+Shift+\\', run: () => togglePaneSwap() })
    P.register({ id: 'edit.find', group: '编辑', title: '查找', hint: 'Ctrl+F', run: () => window.FindManager && FindManager.show && FindManager.show(false) })
    P.register({ id: 'edit.replace', group: '编辑', title: '替换', hint: 'Ctrl+H', run: () => window.FindManager && FindManager.show && FindManager.show(true) })
    P.register({ id: 'insert.heading', group: '插入', title: '标题（循环）', run: () => EditorManager.insertFormat('heading') })
    P.register({ id: 'insert.bold', group: '插入', title: '粗体', hint: 'Ctrl+B', run: () => EditorManager.insertFormat('bold') })
    P.register({ id: 'insert.italic', group: '插入', title: '斜体', hint: 'Ctrl+I', run: () => EditorManager.insertFormat('italic') })
    P.register({ id: 'insert.link', group: '插入', title: '链接', hint: 'Ctrl+K', run: () => EditorManager.insertFormat('link') })
    P.register({ id: 'insert.image', group: '插入', title: '图片', run: () => EditorManager.insertFormat('image') })
    P.register({ id: 'insert.code', group: '插入', title: '行内代码', run: () => EditorManager.insertFormat('code') })
    P.register({ id: 'insert.codeblock', group: '插入', title: '代码块', run: () => EditorManager.insertFormat('codeblock') })
    P.register({ id: 'insert.quote', group: '插入', title: '引用', run: () => EditorManager.insertFormat('quote') })
    P.register({ id: 'insert.ul', group: '插入', title: '无序列表', run: () => EditorManager.insertFormat('ul') })
    P.register({ id: 'insert.ol', group: '插入', title: '有序列表', run: () => EditorManager.insertFormat('ol') })
    P.register({ id: 'insert.table', group: '插入', title: '表格', run: () => EditorManager.insertFormat('table') })
    P.register({ id: 'insert.hr', group: '插入', title: '分割线', run: () => EditorManager.insertFormat('hr') })
    P.register({ id: 'tab.new', group: '标签', title: '新建标签页', run: () => { const t = TabManager.createTab({ title: '未命名' }); TabManager.setActive(t.id) } })
    P.register({ id: 'tab.close', group: '标签', title: '关闭当前标签', hint: 'Ctrl+W', run: () => { const t = TabManager.getActive(); if (t) TabManager.closeTab(t.id) } })
    P.register({ id: 'app.templates', group: '工具', title: '模板库', run: () => TemplateManager.open() })
    P.register({ id: 'app.settings', group: '工具', title: '设置', run: () => SettingsManager.open() })
  }

  // Keyboard shortcuts
  // 使用计数器而非布尔值，防止菜单 IPC 在连续快捷键操作时漏标记
  window.__menuEventPending = 0
  document.addEventListener('keydown', evt => {
    const ctrl = evt.ctrlKey || evt.metaKey
    if (ctrl && evt.key === 's') { evt.preventDefault(); window.__menuEventPending++; saveFile(evt.shiftKey) }
    if (ctrl && evt.key === 'n') { evt.preventDefault(); window.__menuEventPending++; newFile() }
    if (ctrl && evt.key === 'o') { evt.preventDefault(); window.__menuEventPending++; openFile() }
    if (ctrl && evt.shiftKey && (evt.key === 'R' || evt.key === 'r')) { evt.preventDefault(); window.__menuEventPending++; if (window.RecentFiles) RecentFiles.open() }
    if (ctrl && evt.shiftKey && (evt.key === 'P' || evt.key === 'p')) { evt.preventDefault(); if (window.CommandPalette) CommandPalette.open() }
    if (ctrl && evt.key === '\\') {
      evt.preventDefault(); window.__menuEventPending++
      if (evt.shiftKey) { togglePaneSwap() }
      else { const idx = viewModes.indexOf(viewMode); setViewMode(viewModes[(idx + 1) % viewModes.length]) }
    }
    if (ctrl && evt.key === 'w') { evt.preventDefault(); const tab = TabManager.getActive(); if (tab) TabManager.closeTab(tab.id) }
    if (ctrl && evt.key >= '1' && evt.key <= '9') { evt.preventDefault(); const idx = parseInt(evt.key) - 1; const tabs = TabManager.getAllTabs(); if (tabs[idx]) TabManager.setActive(tabs[idx].id) }
    if (ctrl && evt.key === 'Tab') {
      evt.preventDefault()
      const tabs = TabManager.getAllTabs()
      if (tabs.length === 0) return
      const cur = TabManager.getActive()
      const curIdx = cur ? tabs.findIndex(t => t.id === cur.id) : 0
      const dir = evt.shiftKey ? -1 : 1
      const next = tabs[(curIdx + dir + tabs.length) % tabs.length]
      if (next) TabManager.setActive(next.id)
    }
  })

  // Tab scroll with mouse wheel
  const tabsContainer = document.getElementById('tabs-container')
  if (tabsContainer) {
    tabsContainer.addEventListener('wheel', evt => {
      if (evt.deltaY !== 0) { evt.preventDefault(); tabsContainer.scrollLeft += evt.deltaY }
    }, { passive: false })
  }

  // Double-click tab bar to create new tab
  const tabbar = document.getElementById('tabbar')
  if (tabbar) {
    tabbar.addEventListener('dblclick', evt => {
      if (evt.target === tabbar || evt.target === tabsContainer) { evt.preventDefault(); newFile() }
    })
  }

  // Initial render
  PreviewManager.render(EditorManager.getValue())
  updateStatusStats(EditorManager.getValue())
  EditorManager.focus()

  // Window controls (custom title bar)
  const winMinBtn = document.getElementById('win-min')
  const winMaxBtn = document.getElementById('win-max')
  const winCloseBtn = document.getElementById('win-close')
  const winMaxIcon = document.getElementById('win-max-icon')
  if (winMinBtn) winMinBtn.addEventListener('click', () => window.api.winMinimize())
  if (winMaxBtn) winMaxBtn.addEventListener('click', () => window.api.winToggleMaximize())
  if (winCloseBtn) winCloseBtn.addEventListener('click', () => window.api.winClose())

  function updateMaxIcon(isMax) {
    document.body.classList.toggle('is-maximized', !!isMax)
    if (!winMaxIcon) return
    if (isMax) {
      winMaxIcon.innerHTML = '<rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/>'
      winMaxBtn.title = '还原'
    } else {
      winMaxIcon.innerHTML = '<rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/>'
      winMaxBtn.title = '最大化'
    }
  }

  if (window.api && window.api.onWinMaximized) {
    window.api.onWinMaximized(updateMaxIcon)
  }
  if (window.api && window.api.winIsMaximized) {
    window.api.winIsMaximized().then(updateMaxIcon)
  }

  // Track window resize to update maximize icon
  let resizeTimer = null
  window.addEventListener('resize', () => {
    if (!window.api || !window.api.winIsMaximized) return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      window.api.winIsMaximized().then(updateMaxIcon)
    }, 50)
  })

  // ── Drag-and-drop file opening ──
  if (editorContainer) {
    editorContainer.addEventListener('dragover', (evt) => {
      evt.preventDefault()
      editorContainer.classList.add('drag-over')
    })
    editorContainer.addEventListener('dragleave', () => {
      editorContainer.classList.remove('drag-over')
    })
    editorContainer.addEventListener('drop', async (evt) => {
      evt.preventDefault()
      editorContainer.classList.remove('drag-over')
      const files = Array.from(evt.dataTransfer.files)
      for (const file of files) {
        const name = file.name.toLowerCase()
        if (!name.endsWith('.md') && !name.endsWith('.markdown') && !name.endsWith('.mdown') && !name.endsWith('.txt')) {
          ExportManager.showToast('不支持的文件类型: ' + file.name, 'error')
          continue
        }
        const readResult = await window.api.fileRead(file.path)
        if (readResult.success) {
          const title = file.name.replace(/\.(md|markdown|mdown|txt)$/i, '')
          const existed = TabManager.getAllTabs().find(t => t.filePath === file.path)
          if (existed) {
            TabManager.setActive(existed.id)
          } else {
            const tab = TabManager.createTab({ title, filePath: file.path, content: readResult.content })
            TabManager.setActive(tab.id)
            TabManager.markModified(tab.id, false)
            PreviewManager.render(readResult.content)
          }
          if (window.RecentFiles) await RecentFiles.add(file.path)
          welcomeDismissed = true
          document.getElementById('welcome-overlay')?.classList.add('hidden')
        } else {
          ExportManager.showToast('打开失败: ' + readResult.error, 'error')
        }
      }
      EventBus && EventBus.emit('files:dropped', { files })
    })
  }
})()
