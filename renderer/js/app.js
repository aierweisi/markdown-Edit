/**
 * app.js — Main application orchestration
 */

;(async function () {
  // ─── Init editor ──────────────────────────────────────────────
  const editorContainer = document.getElementById('editor-container')
  EditorManager.init(editorContainer)

  // ─── Load settings and apply ──────────────────────────────────
  const settings = await SettingsManager.load()
  SettingsManager.applyTheme(settings.theme)
  SettingsManager.applyFontSize(settings.fontSize)
  SettingsManager.applyEditorFont(settings.editorFont)

  // ─── Init subsystems ──────────────────────────────────────────
  PreviewManager.init()
  TemplateManager.init()
  SettingsManager.init()

  // ─── Template apply callback ──────────────────────────────────
  TemplateManager.onApply((content, name) => {
    const tab = TabManager.getActive()
    if (!tab) return
    const cur = EditorManager.getValue()
    if (cur.trim().length > 0 && name !== '空白文档') {
      if (!confirm(`当前标签页已有内容，是否覆盖？\n取消则在新标签页打开`)) {
        const nt = TabManager.createTab({ title: name, content })
        TabManager.setActive(nt.id)
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

  // ─── Cache recovery ───────────────────────────────────────────
  const cache = await CacheManager.checkAndRestore()
  let restored = false

  if (cache) {
    const doRestore = await CacheManager.showRestoreDialog(cache)
    if (doRestore) {
      await CacheManager.restore(cache)
      restored = true
    } else {
      await CacheManager.clearCache()
    }
  }

  if (!restored) {
    // Create initial empty tab
    const tab = TabManager.createTab({ title: '未命名' })
    TabManager.setActive(tab.id)
  }

  // ─── Start auto-cache ─────────────────────────────────────────
  await CacheManager.loadInterval()
  CacheManager.start()

  // ─── Editor → Preview sync ────────────────────────────────────
  let changeDebounce = null
  EditorManager.onChange((value) => {
    // Update word count
    const wc = EditorManager.getWordCount(value)
    document.getElementById('word-count').textContent = `${wc} 字`

    // Debounce preview render
    clearTimeout(changeDebounce)
    changeDebounce = setTimeout(() => {
      PreviewManager.render(value)
    }, 200)

    // Mark tab modified
    const tab = TabManager.getActive()
    if (tab && !tab.modified) {
      TabManager.markModified(tab.id, true)
    }
  })

  // ─── Pane swap (editor ↔ preview) ────────────────────────────
  let panesSwapped = false

  async function initPaneOrder() {
    const order = await window.api.storeGet('paneOrder')
    // Default is preview-first (editor on right)
    if (order === 'editor-first') {
      applyPaneSwap(false, false)
    } else {
      applyPaneSwap(true, false) // silent, no toast
    }
  }

  function applyPaneSwap(swapped, notify = true) {
    panesSwapped = swapped
    const mainArea = document.getElementById('main-area')
    const editorPane = document.getElementById('editor-pane')
    const divider = document.getElementById('divider')
    const previewPane = document.getElementById('preview-pane')

    // Re-order DOM children
    if (swapped) {
      // preview | divider | editor
      mainArea.appendChild(previewPane)
      mainArea.appendChild(divider)
      mainArea.appendChild(editorPane)
    } else {
      // editor | divider | preview
      mainArea.appendChild(editorPane)
      mainArea.appendChild(divider)
      mainArea.appendChild(previewPane)
    }

    // Update swap button appearance
    const btn = document.getElementById('btn-swap-panes')
    if (btn) btn.classList.toggle('active', !swapped)

    // Persist
    window.api.storeSet('paneOrder', swapped ? 'preview-first' : 'editor-first')

    if (notify) {
      ExportManager.showToast(swapped ? '预览在左，编辑在右' : '编辑在左，预览在右')
    }
  }

  function togglePaneSwap() {
    applyPaneSwap(!panesSwapped)
  }

  // Init pane order from stored setting
  await initPaneOrder()

  document.getElementById('btn-swap-panes').addEventListener('click', togglePaneSwap)

  // ─── Divider drag (resizable panes) ───────────────────────────
  const divider = document.getElementById('divider')
  const mainArea = document.getElementById('main-area')
  const editorPane = document.getElementById('editor-pane')
  const previewPane = document.getElementById('preview-pane')

  let isDragging = false
  let startX, startLeftWidth

  divider.addEventListener('mousedown', (e) => {
    isDragging = true
    startX = e.clientX
    // Left pane is whichever comes first in DOM
    const leftPane = mainArea.firstElementChild
    startLeftWidth = leftPane.getBoundingClientRect().width
    divider.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    const delta = e.clientX - startX
    const totalWidth = mainArea.getBoundingClientRect().width - 4
    const newLeftWidth = Math.max(200, Math.min(totalWidth - 200, startLeftWidth + delta))
    const leftPane = mainArea.firstElementChild
    const rightPane = mainArea.lastElementChild
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
    }
  })

  // ─── View mode toggle ─────────────────────────────────────────
  let viewMode = 'split'
  const viewToggleBtn = document.getElementById('btn-view-toggle')
  const viewModes = ['split', 'editor', 'preview']

  const viewSVGs = {
    split:   `<rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/>`,
    editor:  `<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="8" y1="3" x2="8" y2="21" opacity="0.3"/>`,
    preview: `<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="16" y1="3" x2="16" y2="21" opacity="0.3"/>`
  }

  function setViewMode(mode) {
    viewMode = mode
    mainArea.classList.remove('view-editor-only', 'view-preview-only')
    if (mode === 'editor') mainArea.classList.add('view-editor-only')
    if (mode === 'preview') mainArea.classList.add('view-preview-only')
    const icon = viewToggleBtn.querySelector('svg')
    if (icon) icon.innerHTML = viewSVGs[mode]
    const titles = { split: '分栏视图 (Ctrl+\\)', editor: '仅编辑 (Ctrl+\\)', preview: '仅预览 (Ctrl+\\)' }
    viewToggleBtn.title = titles[mode]
  }

  viewToggleBtn.addEventListener('click', () => {
    const idx = viewModes.indexOf(viewMode)
    setViewMode(viewModes[(idx + 1) % viewModes.length])
  })

  // ─── New tab button ───────────────────────────────────────────
  document.getElementById('btn-tab-new').addEventListener('click', () => {
    const tab = TabManager.createTab({ title: '未命名' })
    TabManager.setActive(tab.id)
    EditorManager.focus()
  })

  // ─── Toolbar buttons ──────────────────────────────────────────
  document.getElementById('btn-new').addEventListener('click', () => newFile())
  document.getElementById('btn-open').addEventListener('click', () => openFile())
  document.getElementById('btn-save').addEventListener('click', () => saveFile())
  document.getElementById('btn-template').addEventListener('click', () => TemplateManager.open())
  document.getElementById('btn-theme').addEventListener('click', () => SettingsManager.toggleTheme())
  document.getElementById('btn-settings').addEventListener('click', () => SettingsManager.open())

  // Format buttons
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      EditorManager.insertFormat(btn.dataset.action)
    })
  })

  // Export dropdown
  const exportBtn = document.getElementById('btn-export')
  const exportMenu = document.getElementById('export-menu')

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation()
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

  // ─── File operations ──────────────────────────────────────────
  function newFile(templateContent) {
    const tab = TabManager.createTab({
      title: '未命名',
      content: templateContent || ''
    })
    TabManager.setActive(tab.id)
    EditorManager.focus()
  }

  async function openFile() {
    const result = await ExportManager.importFile()
    if (!result) return

    const { filePath, content, name } = result
    const title = name.replace(/\.(md|markdown|txt)$/i, '')

    const tab = TabManager.createTab({ title, filePath, content })
    TabManager.setActive(tab.id)
    TabManager.markModified(tab.id, false)
    PreviewManager.render(content)

    // 原生对话框关闭后 Windows OS 焦点未回到 webContents。
    // 必须 await 主进程 IPC（内部会 blur+focus 强制重置 Win32 焦点），
    // 完成后再调用 cm.focus()，否则主进程的 webContents.focus() 会覆盖 cm.focus()
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur()
    }
    if (window.api && window.api.focusWindow) {
      await window.api.focusWindow()
    }
    EditorManager.focus()
    requestAnimationFrame(() => EditorManager.focus())
  }

  async function saveFile(saveAs = false) {
    const tab = TabManager.getActive()
    if (!tab) return

    const content = EditorManager.getValue()
    let filePath = tab.filePath

    if (!filePath || saveAs) {
      const rule = (await window.api.storeGet('exportNamingRule')) || '{title}_{date}'
      const exportDir = (await window.api.storeGet('exportDir')) || ''
      const filename = resolveNamingRuleLocal(rule, content)
      const defaultPath = exportDir ? exportDir + '/' + filename + '.md' : filename + '.md'

      const result = await window.api.dialogSaveFile({
        defaultPath,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      })

      if (result.canceled || !result.filePath) return
      filePath = result.filePath

      const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
      if (dir) window.api.storeSet('exportDir', dir)
    }

    const res = await window.api.fileSave(filePath, content)
    if (res.success) {
      const name = filePath.split(/[/\\]/).pop().replace(/\.(md|markdown)$/i, '')
      TabManager.setTabTitle(tab.id, name, filePath)
      TabManager.markModified(tab.id, false)
      ExportManager.showToast(`已保存: ${filePath.split(/[/\\]/).pop()}`)
    } else {
      alert('保存失败: ' + res.error)
    }
  }

  function resolveNamingRuleLocal(rule, content) {
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '')
    const titleMatch = content.match(/^#\s+(.+)/m)
    const title = titleMatch
      ? titleMatch[1].replace(/[/\\:*?"<>|]/g, '_').trim()
      : '未命名'
    return rule.replace(/{title}/g, title).replace(/{date}/g, date).replace(/{time}/g, time).replace(/{datetime}/g, `${date}_${time}`)
  }

  // ─── Menu event handlers ──────────────────────────────────────
  window.api.onMenuEvent((event) => {
    const content = EditorManager.getValue()
    switch (event) {
      case 'menu-new':        newFile(); break
      case 'menu-open':       openFile(); break
      case 'menu-save':       saveFile(); break
      case 'menu-save-as':    saveFile(true); break
      case 'menu-import':     openFile(); break
      case 'menu-export-md':  ExportManager.exportMd(content); break
      case 'menu-export-html':ExportManager.exportHtml(content); break
      case 'menu-export-pdf': ExportManager.exportPdf(content); break
      case 'menu-toggle-theme': SettingsManager.toggleTheme(); break
      case 'menu-toggle-view': {
        const idx = viewModes.indexOf(viewMode)
        setViewMode(viewModes[(idx + 1) % viewModes.length])
        break
      }
      case 'menu-settings':   SettingsManager.open(); break
      case 'menu-templates':  TemplateManager.open(); break
    }
  })

  // ─── Keyboard shortcuts ───────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key === 's') {
      e.preventDefault()
      saveFile(e.shiftKey)
    }
    if (ctrl && e.key === 'n') {
      e.preventDefault()
      newFile()
    }
    if (ctrl && e.key === 'o') {
      e.preventDefault()
      openFile()
    }
    if (ctrl && e.key === '\\') {
      e.preventDefault()
      if (e.shiftKey) {
        togglePaneSwap()
      } else {
        const idx = viewModes.indexOf(viewMode)
        setViewMode(viewModes[(idx + 1) % viewModes.length])
      }
    }
    if (ctrl && e.key === 'w') {
      e.preventDefault()
      const tab = TabManager.getActive()
      if (tab) TabManager.closeTab(tab.id)
    }
    // Ctrl+1~9 switch tab
    if (ctrl && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1
      const tabs = TabManager.getAllTabs()
      if (tabs[idx]) TabManager.setActive(tabs[idx].id)
    }
  })

  // Initial render
  PreviewManager.render(EditorManager.getValue())
  EditorManager.focus()

  // ─── Custom window controls (frameless) ──────────────────────
  const winMinBtn = document.getElementById('win-min')
  const winMaxBtn = document.getElementById('win-max')
  const winCloseBtn = document.getElementById('win-close')
  const winMaxIcon = document.getElementById('win-max-icon')

  if (winMinBtn) winMinBtn.addEventListener('click', () => window.api.winMinimize())
  if (winMaxBtn) winMaxBtn.addEventListener('click', () => window.api.winToggleMaximize())
  if (winCloseBtn) winCloseBtn.addEventListener('click', () => window.api.winClose())

  function updateMaxIcon(isMax) {
    if (!winMaxIcon) return
    if (isMax) {
      // Restore (two overlapping squares)
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
})()
