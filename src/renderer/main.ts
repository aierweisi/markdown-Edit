import { collectDomRefs } from './dom'
import { createAppContext } from './context'
import { createAppStore } from './state/app-store'
import { bindPersistence } from './state/persist'
import { createEditor } from './editor/editor-api'
import { createPreview } from './preview/render'
import { createTabManager } from './tabs/tab-manager'
import { mountTabBar } from './tabs/tab-bar'
import { createCacheManager, exposeForMainProcess } from './cache/cache-manager'
import { createRecentManager } from './recent/recent-files'
import { openFileByPath, openFileViaDialog } from './files/open'
import { saveActiveTab } from './files/save'
import { attachDragDrop } from './files/drag-drop'
import { attachImagePaste } from './files/paste-image'
import { exportMarkdown } from './export/export-md'
import { exportHtml } from './export/export-html'
import { exportPdf } from './export/export-pdf'
import { createPalette } from './ui/palette'
import { createSettingsPanel } from './ui/settings-panel'
import { createRecentPanel } from './ui/recent-panel'
import { createTemplatesPanel } from './ui/templates-panel'
import { createStatusBar } from './ui/status-bar'
import { attachWelcome } from './ui/welcome'
import { attachWindowControls } from './ui/window-controls'
import { applyThemeSideEffects } from './ui/theme'
import { showToast } from './ui/toast'
import { showCloseConfirm } from './ui/confirm-modal'
import { createOutlinePanel } from './ui/outline-panel'
import { debounce as outlineDebounce } from './lib/debounce'
import { attachSyncScroll } from './preview/sync-scroll'
import { attachImageLightbox } from './preview/image-lightbox'
import { attachFind } from './find/find-panel'
import { debounce } from './lib/debounce'
import { titleFromPath } from './lib/fs-paths'
import { refreshMermaidTheme } from './preview/lazy-mermaid'
import type { Settings, ViewMode } from '@shared/types'
import './styles/index.css'

const DEFAULT_SETTINGS: Settings = {
  theme: 'light',
  fontSize: 15,
  editorFont: "'JetBrains Mono', 'Fira Code', monospace",
  autoSaveInterval: 10,
  exportDir: '',
  exportNamingRule: '{title}_{date}',
  imageSaveDir: 'assets',
  paneOrder: 'preview-first',
}

const VIEW_MODES: ViewMode[] = ['split', 'editor', 'preview']

async function loadSettings(): Promise<Settings> {
  const [theme, fontSize, editorFont, autoSave, exportDir, naming, imageDir, paneOrder] =
    await Promise.all([
      window.api.storeGet('theme'),
      window.api.storeGet('fontSize'),
      window.api.storeGet('editorFont'),
      window.api.storeGet('autoSaveInterval'),
      window.api.storeGet('exportDir'),
      window.api.storeGet('exportNamingRule'),
      window.api.storeGet('imageSaveDir'),
      window.api.storeGet('paneOrder'),
    ])
  return {
    theme: theme ?? DEFAULT_SETTINGS.theme,
    fontSize: fontSize ?? DEFAULT_SETTINGS.fontSize,
    editorFont: editorFont ?? DEFAULT_SETTINGS.editorFont,
    autoSaveInterval: autoSave ?? DEFAULT_SETTINGS.autoSaveInterval,
    exportDir: exportDir ?? DEFAULT_SETTINGS.exportDir,
    exportNamingRule: naming ?? DEFAULT_SETTINGS.exportNamingRule,
    imageSaveDir: imageDir ?? DEFAULT_SETTINGS.imageSaveDir,
    paneOrder: paneOrder ?? DEFAULT_SETTINGS.paneOrder,
  }
}

async function bootstrap(): Promise<void> {
  const dom = collectDomRefs()
  const settings = await loadSettings()
  const store = createAppStore(settings)
  const ctx = createAppContext(store, dom)

  applyThemeSideEffects(ctx, settings.theme)
  document.documentElement.style.setProperty('--editor-font-size', `${settings.fontSize}px`)
  document.documentElement.style.setProperty('--font-mono', settings.editorFont)

  bindPersistence(store)

  const tabs = createTabManager(ctx)

  if (!dom.editorContainer || !dom.previewBody) {
    document.body.innerHTML = '<p>missing editor/preview container</p>'
    return
  }

  const editor = createEditor({
    parent: dom.editorContainer,
    theme: settings.theme,
    initialValue: '',
  })

  const preview = createPreview({ body: dom.previewBody })
  // Sync preview's base-URL with the active tab so relative <img>/<a> resolve
  // against the document's directory, not against `out/renderer/`.
  const syncPreviewBase = (): void => {
    const tab = tabs.getActive()
    preview.setBaseFilePath(tab?.filePath ?? null)
  }
  ctx.store.activeTabId.subscribe(syncPreviewBase)
  ctx.store.tabs.subscribe(syncPreviewBase)
  if (dom.previewContainer) attachSyncScroll({ editor, previewContainer: dom.previewContainer })
  attachImageLightbox(dom.previewBody)

  const recent = createRecentManager(ctx)
  const cache = createCacheManager({ ctx, tabs, editor })
  exposeForMainProcess(cache)

  const statusBar = createStatusBar({ ctx })
  const palette = createPalette()
  const settingsPanel = createSettingsPanel(ctx)
  const recentPanel = createRecentPanel({
    recent,
    onSelect: (path) =>
      void openFileByPath({ ctx, tabs, editor, onContentLoaded: (c) => preview.render(c) }, path),
  })
  const templatesPanel = createTemplatesPanel(ctx)
  const outline = createOutlinePanel({
    ctx,
    onJump(line) {
      editor.jumpToLine(line)
    },
  })
  const refreshOutlineDebounced = outlineDebounce(
    (text: string) => outline.refresh(text),
    150,
  )
  function syncOutlineTitle(): void {
    const tab = tabs.getActive()
    outline.setTitle(tab?.title ?? '大纲')
  }
  ctx.store.activeTabId.subscribe(syncOutlineTitle)
  ctx.store.tabs.subscribe(syncOutlineTitle)

  templatesPanel.onApply((content, name) => {
    const active = tabs.getActive()
    if (active && tabs.getContent(active.id).trim().length === 0) {
      // Apply into current empty tab
      editor.setValue(content)
      tabs.setContent(active.id, content)
      tabs.setTitle(active.id, name)
      tabs.markModified(active.id, content.length > 0)
    } else {
      const tab = tabs.create({ title: name, content })
      tabs.setActive(tab.id)
      editor.setValue(content)
      tabs.markModified(tab.id, content.length > 0)
    }
    preview.render(content)
  })

  // ── Editor change → tab content + preview + cache markDirty ─────────
  const onChange = (value: string): void => {
    const id = ctx.store.activeTabId()
    if (id) {
      tabs.setContent(id, value)
      const tab = tabs.getById(id)
      if (tab && !tab.modified) tabs.markModified(id, true)
    }
    preview.render(value)
    statusBar.setText(value)
    cache.markDirty()
    // schedule autosave to file for tabs with a real path
    scheduleAutosave()
  }
  editor.onChange(onChange)
  editor.onChange((value) => refreshOutlineDebounced(value))

  editor.onCursorChange(({ line, col, selection }) => statusBar.setCursor(line, col, selection))

  // ── Autosave: debounced per current autoSaveInterval setting ────────
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleAutosave(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer)
    const ms = ctx.store.autosaveMs()
    autosaveTimer = setTimeout(() => {
      void autosaveActive()
    }, ms)
  }
  async function autosaveActive(): Promise<void> {
    const tab = tabs.getActive()
    if (!tab || !tab.filePath || !tab.modified) return
    if (ctx.store.saving()) return
    ctx.store.saving.set(true)
    try {
      const result = await ctx.api.fileSave(tab.filePath, editor.getValue())
      if (result.success) {
        tabs.markModified(tab.id, false)
        statusBar.setSaving(false)
      }
    } finally {
      ctx.store.saving.set(false)
    }
  }

  // ── Theme signal → editor + body class + mermaid theme refresh ──────
  ctx.store.theme.subscribe((next) => {
    editor.setTheme(next)
    applyThemeSideEffects(ctx, next)
    refreshMermaidTheme(next)
  })

  // ── Settings signal → CSS vars ──────────────────────────────────────
  ctx.store.settings.subscribe((next) => {
    document.documentElement.style.setProperty('--editor-font-size', `${next.fontSize}px`)
    document.documentElement.style.setProperty('--font-mono', next.editorFont)
  })

  // ── Tab bar (event delegated) ───────────────────────────────────────
  const switchActive = (id: string): void => {
    const cur = ctx.store.activeTabId()
    if (cur === id) return
    if (cur) tabs.setContent(cur, editor.getValue())
    ctx.store.activeTabId.set(id)
    editor.setValue(tabs.getContent(id))
    preview.render(tabs.getContent(id))
    statusBar.setText(tabs.getContent(id))
    if (outline.isVisible()) outline.refresh(tabs.getContent(id))
  }
  /**
   * Close one tab. If it has unsaved changes, prompt save / discard / cancel.
   * Returns true if the tab was actually closed.
   */
  const closeTabAndUpdate = async (id: string): Promise<boolean> => {
    const tab = tabs.getById(id)
    if (tab && tab.modified) {
      // Make sure user sees what they're about to lose.
      if (ctx.store.activeTabId() !== id) switchActive(id)
      const choice = await showCloseConfirm({
        message: `"${tab.title}" 有未保存的更改,要保存吗?`,
      })
      if (choice === 'cancel') return false
      if (choice === 'save') {
        const ok = await save(false)
        if (!ok) return false
      }
    }
    tabs.close(id)
    const next = ctx.store.activeTabId()
    if (next) {
      editor.setValue(tabs.getContent(next))
      preview.render(tabs.getContent(next))
      statusBar.setText(tabs.getContent(next))
    } else {
      editor.setValue('')
      preview.render('')
      statusBar.setText('')
    }
    return true
  }
  mountTabBar({
    ctx,
    tabs,
    onActivate: switchActive,
    onClose: closeTabAndUpdate,
    onNewTab: () => newFile(),
    onCloseOthers(id) {
      tabs
        .getAll()
        .filter((t) => t.id !== id)
        .forEach((t) => tabs.close(t.id))
      switchActive(id)
    },
    onCloseRight(id) {
      const all = tabs.getAll()
      const idx = all.findIndex((t) => t.id === id)
      if (idx < 0) return
      all.slice(idx + 1).forEach((t) => tabs.close(t.id))
    },
    onRename(id) {
      const tab = tabs.getById(id)
      if (!tab) return
      const tabEl = document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)
      const titleEl = tabEl?.querySelector<HTMLElement>('.tab-title')
      if (!tabEl || !titleEl) return
      const input = document.createElement('input')
      input.type = 'text'
      input.value = tab.title
      input.className = 'tab-rename-input'
      input.style.cssText =
        'background:transparent;border:1px solid var(--accent,#4f7ef7);border-radius:3px;color:inherit;font:inherit;padding:0 4px;width:8em'
      titleEl.replaceWith(input)
      input.focus()
      input.select()
      const commit = (apply: boolean): void => {
        if (apply) {
          const value = input.value.trim() || tab.title
          tabs.setTitle(id, value)
        }
        input.replaceWith(titleEl)
      }
      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') commit(true)
        if (evt.key === 'Escape') commit(false)
      })
      input.addEventListener('blur', () => commit(true))
    },
  })

  // ── Drag-drop + paste image ─────────────────────────────────────────
  attachDragDrop({
    ctx,
    tabs,
    editor,
    onAfterOpen(content) {
      preview.render(content)
      statusBar.setText(content)
    },
  })
  attachImagePaste({ ctx, editor, tabs })

  // ── Window controls ─────────────────────────────────────────────────
  attachWindowControls(ctx)

  // ── Restore from cache or create blank tab ──────────────────────────
  const snapshot = await cache.loadSnapshot()
  if (snapshot && snapshot.tabs.length > 0) {
    cache.applySnapshot(snapshot)
    const active = tabs.getActive()
    if (active) {
      editor.setValue(tabs.getContent(active.id))
      preview.render(tabs.getContent(active.id))
      statusBar.setText(tabs.getContent(active.id))
    }
  } else {
    const tab = tabs.create({
      title: '未命名',
      content: '# 开始写作\n\n输入 Markdown，右侧实时预览。',
    })
    tabs.setActive(tab.id)
    editor.setValue(tabs.getContent(tab.id))
    preview.render(tabs.getContent(tab.id))
    statusBar.setText(tabs.getContent(tab.id))
  }
  cache.start()

  // ── Welcome overlay ─────────────────────────────────────────────────
  attachWelcome({
    ctx,
    tabs,
    onNew: () => newFile(),
    onOpen: () => void openFile(),
    onTemplate: () => templatesPanel.open(),
  })

  // ── File ops shortcuts ──────────────────────────────────────────────
  function newFile(): void {
    const tab = tabs.create({ title: '未命名' })
    tabs.setActive(tab.id)
    editor.setValue('')
    preview.render('')
    statusBar.setText('')
    editor.focus()
  }
  async function openFile(): Promise<void> {
    await openFileViaDialog({
      ctx,
      tabs,
      editor,
      onContentLoaded(content) {
        preview.render(content)
        statusBar.setText(content)
        const active = tabs.getActive()
        if (active?.filePath) void recent.add(active.filePath)
      },
    })
  }
  async function save(saveAs = false): Promise<boolean> {
    const ok = await saveActiveTab({
      ctx,
      tabs,
      getCurrentContent: () => editor.getValue(),
    }, saveAs)
    if (ok) {
      const tab = tabs.getActive()
      if (tab?.filePath) {
        await recent.add(tab.filePath)
        showToast(`已保存: ${titleFromPath(tab.filePath)}`, 'success')
      }
    }
    return ok
  }

  // ── Toolbar buttons: v1 element IDs + v2 data-action delegation ─────
  const onBtnId = (id: string, fn: () => void): void => {
    document.getElementById(id)?.addEventListener('click', fn)
  }
  onBtnId('btn-new', newFile)
  onBtnId('btn-open', () => void openFile())
  onBtnId('btn-save', () => void save())
  onBtnId('btn-template', () => templatesPanel.open())
  onBtnId('btn-theme', () => ctx.store.theme.set(ctx.store.theme() === 'dark' ? 'light' : 'dark'))
  onBtnId('btn-settings', () => settingsPanel.open())
  onBtnId('btn-outline', () => {
    outline.toggle()
    if (outline.isVisible()) outline.refresh(editor.getValue())
  })
  onBtnId('btn-tab-new', () => {
    const tab = tabs.create({ title: '未命名' })
    tabs.setActive(tab.id)
    editor.setValue('')
    preview.render('')
    statusBar.setText('')
    editor.focus()
  })
  onBtnId('btn-view-toggle', () => {
    const idx = VIEW_MODES.indexOf(ctx.store.viewMode())
    ctx.store.viewMode.set(VIEW_MODES[(idx + 1) % VIEW_MODES.length])
  })
  onBtnId('btn-swap-panes', () => {
    const next = ctx.store.paneOrder() === 'preview-first' ? 'editor-first' : 'preview-first'
    ctx.store.paneOrder.set(next)
  })
  onBtnId('status-palette-hint', () => palette.open())

  // v1 export menu (.export-wrap → .export-menu .export-item[data-type])
  const exportBtn = document.getElementById('btn-export')
  const exportMenu = document.getElementById('export-menu')
  exportBtn?.addEventListener('click', (evt) => {
    evt.stopPropagation()
    exportMenu?.classList.toggle('open')
  })
  document.addEventListener('click', () => exportMenu?.classList.remove('open'))
  document.querySelectorAll<HTMLElement>('.export-item').forEach((item) => {
    item.addEventListener('click', () => {
      exportMenu?.classList.remove('open')
      const type = item.dataset.type
      const content = editor.getValue()
      const title = tabs.getActive()?.title ?? '未命名'
      if (type === 'md') void exportMarkdown({ ctx, content, title })
      else if (type === 'html') void exportHtml({ ctx, content, title, theme: ctx.store.theme() })
      else if (type === 'pdf') void exportPdf({ ctx, content, title })
      else if (type === 'settings') settingsPanel.open()
    })
  })

  // v1 format buttons (.fmt-btn[data-action])
  document.querySelectorAll<HTMLElement>('.fmt-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action
      if (action) editor.insertFormat(action as Parameters<typeof editor.insertFormat>[0])
    })
  })

  // ── Generic data-action delegation (for v2-only buttons) ────────────
  document.addEventListener('click', (evt) => {
    const t = (evt.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!t) return
    // Skip ones already handled by direct binding to avoid double-trigger
    if (t.classList.contains('fmt-btn')) return
    if (t.id && ['btn-new', 'btn-open', 'btn-save', 'btn-template', 'btn-theme',
      'btn-settings', 'btn-tab-new', 'btn-view-toggle', 'btn-swap-panes'].includes(t.id)) return
    const action = t.dataset.action
    switch (action) {
      case 'new':
        newFile()
        break
      case 'open':
        void openFile()
        break
      case 'save':
        void save()
        break
      case 'toggle-theme': {
        const next = ctx.store.theme() === 'dark' ? 'light' : 'dark'
        ctx.store.theme.set(next)
        break
      }
      case 'tab-new': {
        const tab = tabs.create({ title: '未命名' })
        tabs.setActive(tab.id)
        editor.setValue('')
        preview.render('')
        statusBar.setText('')
        editor.focus()
        break
      }
      case 'settings':
        settingsPanel.open()
        break
      case 'templates':
        templatesPanel.open()
        break
      case 'recent':
        void recentPanel.open()
        break
      case 'palette':
        palette.open()
        break
      case 'view-toggle': {
        const idx = VIEW_MODES.indexOf(ctx.store.viewMode())
        ctx.store.viewMode.set(VIEW_MODES[(idx + 1) % VIEW_MODES.length])
        break
      }
      case 'export-md':
        void exportMarkdown({
          ctx,
          content: editor.getValue(),
          title: tabs.getActive()?.title ?? '未命名',
        })
        break
      case 'export-html':
        void exportHtml({
          ctx,
          content: editor.getValue(),
          title: tabs.getActive()?.title ?? '未命名',
          theme: ctx.store.theme(),
        })
        break
      case 'export-pdf':
        void exportPdf({
          ctx,
          content: editor.getValue(),
          title: tabs.getActive()?.title ?? '未命名',
        })
        break
      default:
        // editor format actions
        if (action) {
          try {
            editor.insertFormat(action as Parameters<typeof editor.insertFormat>[0])
          } catch {
            /* unknown action */
          }
        }
    }
  })

  // ── ViewMode signal → main-area class ───────────────────────────────
  if (dom.mainArea) {
    ctx.store.viewMode.subscribe((mode) => {
      dom.mainArea!.classList.remove('view-editor-only', 'view-preview-only')
      if (mode === 'editor') dom.mainArea!.classList.add('view-editor-only')
      if (mode === 'preview') dom.mainArea!.classList.add('view-preview-only')
    })

    // paneOrder signal → physically reorder editor/preview/divider in main-area
    const applyPaneOrder = (order: 'preview-first' | 'editor-first'): void => {
      const editorPane = document.getElementById('editor-pane')
      const previewPane = document.getElementById('preview-pane')
      const divider = document.getElementById('divider')
      if (!editorPane || !previewPane || !divider) return
      if (order === 'editor-first') {
        dom.mainArea!.appendChild(editorPane)
        dom.mainArea!.appendChild(divider)
        dom.mainArea!.appendChild(previewPane)
      } else {
        dom.mainArea!.appendChild(previewPane)
        dom.mainArea!.appendChild(divider)
        dom.mainArea!.appendChild(editorPane)
      }
      const btn = document.getElementById('btn-swap-panes')
      if (btn) btn.classList.toggle('active', order === 'preview-first')
    }
    applyPaneOrder(ctx.store.paneOrder())
    ctx.store.paneOrder.subscribe(applyPaneOrder)
  }

  // ── Find ────────────────────────────────────────────────────────────
  const find = attachFind(editor.view)

  // ── Palette commands ────────────────────────────────────────────────
  palette.register({ id: 'file.new', group: '文件', title: '新建', hint: 'Ctrl+N', run: newFile })
  palette.register({ id: 'file.open', group: '文件', title: '打开文件…', hint: 'Ctrl+O', run: openFile })
  palette.register({
    id: 'file.save',
    group: '文件',
    title: '保存',
    hint: 'Ctrl+S',
    run: async () => {
      await save()
    },
  })
  palette.register({
    id: 'file.saveAs',
    group: '文件',
    title: '另存为…',
    hint: 'Ctrl+Shift+S',
    run: async () => {
      await save(true)
    },
  })
  palette.register({ id: 'file.recent', group: '文件', title: '最近文件…', hint: 'Ctrl+Shift+R', run: () => recentPanel.open() })
  palette.register({
    id: 'view.toggleTheme',
    group: '视图',
    title: '切换主题',
    hint: 'Ctrl+Shift+T',
    run: () => ctx.store.theme.set(ctx.store.theme() === 'dark' ? 'light' : 'dark'),
  })
  palette.register({
    id: 'view.toggleMode',
    group: '视图',
    title: '循环视图模式',
    hint: 'Ctrl+\\',
    run: () => {
      const idx = VIEW_MODES.indexOf(ctx.store.viewMode())
      ctx.store.viewMode.set(VIEW_MODES[(idx + 1) % VIEW_MODES.length])
    },
  })
  palette.register({ id: 'edit.find', group: '编辑', title: '查找', hint: 'Ctrl+F', run: () => find.open() })
  palette.register({ id: 'app.settings', group: '工具', title: '设置', hint: 'Ctrl+,', run: () => settingsPanel.open() })
  palette.register({ id: 'app.templates', group: '工具', title: '模板库', run: () => templatesPanel.open() })
  palette.register({
    id: 'view.outline',
    group: '视图',
    title: '文章大纲',
    hint: 'Ctrl+Shift+O',
    run: () => {
      outline.toggle()
      if (outline.isVisible()) outline.refresh(editor.getValue())
    },
  })
  palette.register({
    id: 'app.shortcuts',
    group: '工具',
    title: '快捷键',
    hint: 'Ctrl+Shift+/',
    run: () => settingsPanel.open('shortcuts'),
  })
  palette.register({
    id: 'export.md',
    group: '导出',
    title: '导出 Markdown',
    run: async () => {
      await exportMarkdown({
        ctx,
        content: editor.getValue(),
        title: tabs.getActive()?.title ?? '未命名',
      })
    },
  })
  palette.register({
    id: 'export.html',
    group: '导出',
    title: '导出 HTML',
    run: async () => {
      await exportHtml({
        ctx,
        content: editor.getValue(),
        title: tabs.getActive()?.title ?? '未命名',
        theme: ctx.store.theme(),
      })
    },
  })
  palette.register({
    id: 'export.pdf',
    group: '导出',
    title: '导出 PDF',
    run: async () => {
      await exportPdf({
        ctx,
        content: editor.getValue(),
        title: tabs.getActive()?.title ?? '未命名',
      })
    },
  })

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  document.addEventListener('keydown', (evt) => {
    const ctrl = evt.ctrlKey || evt.metaKey
    if (!ctrl) return
    const key = evt.key.toLowerCase()

    if (key === 's') {
      evt.preventDefault()
      void save(evt.shiftKey)
    } else if (key === 'n' && !evt.shiftKey) {
      evt.preventDefault()
      newFile()
    } else if (key === 'o') {
      evt.preventDefault()
      void openFile()
    } else if (key === 'r' && evt.shiftKey) {
      evt.preventDefault()
      void recentPanel.open()
    } else if (key === 'p' && evt.shiftKey) {
      // Ctrl+Shift+P → palette (Ctrl+K is reserved for link insert)
      evt.preventDefault()
      palette.open()
    } else if (key === ',') {
      evt.preventDefault()
      settingsPanel.open()
    } else if (key === '\\') {
      evt.preventDefault()
      const idx = VIEW_MODES.indexOf(ctx.store.viewMode())
      ctx.store.viewMode.set(VIEW_MODES[(idx + 1) % VIEW_MODES.length])
    } else if (key === 'w') {
      evt.preventDefault()
      const tab = tabs.getActive()
      if (tab) tabs.close(tab.id)
    } else if (key === 't' && !evt.shiftKey) {
      evt.preventDefault()
      const tab = tabs.create({ title: '未命名' })
      tabs.setActive(tab.id)
      editor.setValue('')
      preview.render('')
    } else if (key === 'tab') {
      evt.preventDefault()
      const all = tabs.getAll()
      if (all.length === 0) return
      const cur = ctx.store.activeTabId()
      const curIdx = cur ? all.findIndex((t) => t.id === cur) : 0
      const dir = evt.shiftKey ? -1 : 1
      const next = all[(curIdx + dir + all.length) % all.length]
      ctx.store.activeTabId.set(next.id)
      editor.setValue(tabs.getContent(next.id))
      preview.render(tabs.getContent(next.id))
    } else if (key >= '1' && key <= '9') {
      evt.preventDefault()
      const idx = parseInt(key, 10) - 1
      const all = tabs.getAll()
      if (all[idx]) ctx.store.activeTabId.set(all[idx].id)
    } else if (evt.shiftKey && key === 't') {
      evt.preventDefault()
      ctx.store.theme.set(ctx.store.theme() === 'dark' ? 'light' : 'dark')
    } else if (evt.shiftKey && (key === '/' || key === '?')) {
      evt.preventDefault()
      settingsPanel.open('shortcuts')
    } else if (evt.shiftKey && key === 'o') {
      evt.preventDefault()
      outline.toggle()
      if (outline.isVisible()) outline.refresh(editor.getValue())
    }
  })

  // ── Menu IPC dispatch ───────────────────────────────────────────────
  ctx.api.onMenuEvent((event) => {
    switch (event) {
      case 'menu:new':
        newFile()
        break
      case 'menu:open':
      case 'menu:import':
        void openFile()
        break
      case 'menu:save':
        void save()
        break
      case 'menu:save-as':
        void save(true)
        break
      case 'menu:export-md':
        void exportMarkdown({ ctx, content: editor.getValue(), title: tabs.getActive()?.title ?? '未命名' })
        break
      case 'menu:export-html':
        void exportHtml({
          ctx,
          content: editor.getValue(),
          title: tabs.getActive()?.title ?? '未命名',
          theme: ctx.store.theme(),
        })
        break
      case 'menu:export-pdf':
        void exportPdf({ ctx, content: editor.getValue(), title: tabs.getActive()?.title ?? '未命名' })
        break
      case 'menu:toggle-theme':
        ctx.store.theme.set(ctx.store.theme() === 'dark' ? 'light' : 'dark')
        break
      case 'menu:toggle-view': {
        const idx = VIEW_MODES.indexOf(ctx.store.viewMode())
        ctx.store.viewMode.set(VIEW_MODES[(idx + 1) % VIEW_MODES.length])
        break
      }
      case 'menu:settings':
        settingsPanel.open()
        break
      case 'menu:templates':
        templatesPanel.open()
        break
      case 'menu:recent':
        void recentPanel.open()
        break
    }
  })

  // ── OS file-association open ────────────────────────────────────────
  const lastOpenedAt = new Map<string, number>()
  ctx.api.onOpenFileFromOS(({ filePath, content, name }) => {
    const now = Date.now()
    if ((lastOpenedAt.get(filePath) ?? 0) > now - 2000) return
    lastOpenedAt.set(filePath, now)

    const existing = tabs.getAll().find((t) => t.filePath === filePath)
    if (existing) {
      ctx.store.activeTabId.set(existing.id)
      editor.setValue(content)
      preview.render(content)
      return
    }
    const tab = tabs.create({ title: titleFromPath(name) || '未命名', filePath, content })
    tabs.setActive(tab.id)
    tabs.markModified(tab.id, false)
    editor.setValue(content)
    preview.render(content)
    void recent.add(filePath)
  })

  ctx.api.onOpenFileError(({ error }) => {
    showToast(`打开文件失败: ${error}`, 'error')
  })

  // ── Debounced status-bar update for typing ──────────────────────────
  const updateStatus = debounce((value: string) => statusBar.setText(value), 300)
  editor.onChange((value) => updateStatus(value))

  editor.focus()
}

void bootstrap().catch((err) => {
  console.error('[bootstrap] failed:', err)
  document.body.innerHTML = `<pre style="padding:20px;color:red">Bootstrap failed: ${
    err instanceof Error ? err.message : String(err)
  }</pre>`
})
