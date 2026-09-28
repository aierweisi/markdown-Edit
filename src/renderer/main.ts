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
import { saveActiveTab, serializeSave, whenTabSaveSettled } from './files/save'
import { createFileSync } from './files/file-sync'
import { attachDragDrop } from './files/drag-drop'
import { attachImagePaste } from './files/paste-image'
import { exportMarkdown } from './export/export-md'
import { exportHtml } from './export/export-html'
import { exportPdf } from './export/export-pdf'
import { copyRichText } from './export/copy-rich'
import { createPalette } from './ui/palette'
import { createSettingsPanel } from './ui/settings-panel'
import { createRecentPanel } from './ui/recent-panel'
import { createWorkspacePanel } from './ui/workspace-panel'
import { createActivitybar, type ActivitybarApi } from './ui/activitybar'
import { createSearchPanel } from './ui/search-panel'
import { createTemplatesPanel } from './ui/templates-panel'
import { openTableGrid } from './ui/table-grid-popover'
import { initToolbarOverflow } from './ui/toolbar-overflow'
import { createStatusBar } from './ui/status-bar'
import { attachWelcome } from './ui/welcome'
import { attachWindowControls } from './ui/window-controls'
import { applyThemeSideEffects, effectiveTheme } from './ui/theme'
import { showToast } from './ui/toast'
import { showCloseConfirm } from './ui/confirm-modal'
import { createOutlinePanel } from './ui/outline-panel'
import { installModalFocusTrap } from './ui/focus-trap'
import { attachSyncScroll } from './preview/sync-scroll'
import { attachImageLightbox } from './preview/image-lightbox'
import { attachFind } from './find/find-panel'
import { attachTableMenu } from './editor/table/table-menu'
import { debounce } from './lib/debounce'
import { titleFromPath, getFileName, getDirAndSep, getExtension, sanitizeFileName } from './lib/fs-paths'
import { refreshMermaidTheme } from './preview/lazy-mermaid'
import type { Settings, ViewMode } from '@shared/types'
import type { TabState } from './state/app-store'
import './styles/index.css'
import { DEFAULT_SETTINGS } from '@shared/defaults'

const VIEW_MODES: ViewMode[] = ['split', 'editor', 'preview']

async function loadSettings(): Promise<Settings> {
  const [theme, fontSize, editorFont, autoSave, exportDir, naming, imageDir, paneOrder, lineNum, folding, imgCompOn, imgCompSize, imgCompQ, statusBarCfg] =
    await Promise.all([
      window.api.storeGet('theme'),
      window.api.storeGet('fontSize'),
      window.api.storeGet('editorFont'),
      window.api.storeGet('autoSaveInterval'),
      window.api.storeGet('exportDir'),
      window.api.storeGet('exportNamingRule'),
      window.api.storeGet('imageSaveDir'),
      window.api.storeGet('paneOrder'),
      window.api.storeGet('lineNumbers'),
      window.api.storeGet('codeFolding'),
      window.api.storeGet('imageCompressEnabled'),
      window.api.storeGet('imageCompressMaxSize'),
      window.api.storeGet('imageCompressQuality'),
      window.api.storeGet('statusBar'),
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
    lineNumbers: lineNum ?? DEFAULT_SETTINGS.lineNumbers,
    codeFolding: folding ?? DEFAULT_SETTINGS.codeFolding,
    imageCompressEnabled: imgCompOn ?? DEFAULT_SETTINGS.imageCompressEnabled,
    imageCompressMaxSize: imgCompSize ?? DEFAULT_SETTINGS.imageCompressMaxSize,
    imageCompressQuality: imgCompQ ?? DEFAULT_SETTINGS.imageCompressQuality,
    statusBar: statusBarCfg ?? DEFAULT_SETTINGS.statusBar,
  }
}

async function bootstrap(): Promise<void> {
  const dom = collectDomRefs()
  // Fetch settings + dividerPos in parallel — independent IPC round-trips,
  // serializing them only adds latency to first paint.
  const [settings, dividerPos] = await Promise.all([
    loadSettings(),
    window.api.storeGet('dividerPos'),
  ])
  const store = createAppStore(settings, dividerPos ?? 0)
  const ctx = createAppContext(store, dom)

  applyThemeSideEffects(ctx, settings.theme)
  document.documentElement.style.setProperty('--editor-font-size', `${settings.fontSize}px`)
  document.documentElement.style.setProperty('--font-mono', settings.editorFont)

  bindPersistence(store)

  const tabs = createTabManager(ctx)

  if (!dom.editorContainer || !dom.previewBody) {
    document.body.innerHTML = '<p>缺少编辑器/预览容器</p>'
    return
  }

  const editor = createEditor({
    parent: dom.editorContainer,
    theme: effectiveTheme(settings.theme),
    initialValue: '',
    lineNumbers: settings.lineNumbers,
    folding: settings.codeFolding,
  })

  const preview = createPreview({
    body: dom.previewBody,
    getDoc: () => editor.getValue(),
    onReplaceLine: (line, text) => editor.replaceLine(line, text),
    onWikiClick: (name) => {
      void (async () => {
        const res = await ctx.api.workspaceResolveWiki(name)
        if (res.success) {
          void openFileByPath(
            { ctx, tabs, editor, onContentLoaded: presentContent },
            res.path,
          )
        } else {
          showToast(
            res.error === 'no workspace' ? '请先打开工作区 (Ctrl+Shift+E)' : `未在工作区找到「${name}」`,
            'info',
          )
        }
      })()
    },
    onHeadingClick: (line) => editor.jumpToLine(line),
  })
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

  const statusBar = createStatusBar({ ctx })
  const palette = createPalette()
  const settingsPanel = createSettingsPanel(ctx)
  const recentPanel = createRecentPanel({
    recent,
    onSelect: (path) =>
      void openFileByPath({ ctx, tabs, editor, onContentLoaded: presentContent }, path),
  })
  const activitybarRef: { api: ActivitybarApi | null } = { api: null }
  const workspacePanel = createWorkspacePanel({
    ctx,
    onOpenFile: (path) =>
      void openFileByPath({ ctx, tabs, editor, onContentLoaded: presentContent }, path),
    onFileMoved: (oldPath, newPath) => {
      // Update any open tab whose file was moved, or lives inside a moved folder,
      // so subsequent saves write to the new path (content stays in memory).
      const norm = (p: string): string => p.replace(/\\/g, '/')
      const oldN = norm(oldPath)
      const newN = norm(newPath)
      for (const t of tabs.getAll()) {
        const fp = t.filePath
        if (!fp) continue
        const fpN = norm(fp)
        if (fpN === oldN) {
          tabs.setTitle(t.id, getFileName(newPath), newPath)
        } else if (fpN.startsWith(oldN + '/')) {
          tabs.setTitle(t.id, t.title, newN + fpN.slice(oldN.length))
        }
      }
    },
    onFolderOpened: () => activitybarRef.api?.openView('workspace'),
  })
  const templatesPanel = createTemplatesPanel(ctx)
  const outline = createOutlinePanel({
    ctx,
    onJump(line) {
      editor.jumpToLine(line)
    },
  })
  const searchPanel = createSearchPanel({
    ctx,
    // Open the hit's file (switching to its tab if already open), then put
    // the cursor on the matched line — jumpToLine also focuses the editor.
    onOpenHit: (path, line) => {
      void openFileByPath(
        { ctx, tabs, editor, onContentLoaded: presentContent },
        path,
      ).then(() => editor.jumpToLine(line))
    },
  })
  // Reflect the heading currently in view as the active outline item.
  if (dom.previewContainer) outline.attachScrollSpy(dom.previewContainer)
  const activitybar = createActivitybar({
    ctx,
    workspace: workspacePanel,
    outline,
    search: searchPanel,
    getEditorText: () => editor.getValue(),
  })
  activitybarRef.api = activitybar
  void (async () => {
    await workspacePanel.restore()
    await activitybar.init()
  })()
  // Reflect freshly-loaded content across every surface. Used by all
  // programmatic open paths (dialog, OS association, workspace tree, wiki,
  // recent, drag-drop, file-sync reload) so the outline + status bar stay in
  // sync — editor.setValue() is programmatic and does not fire onChange, so
  // without this the outline would keep the previous document's headings.
  function presentContent(content: string, stat?: { mtimeMs: number; size: number }): void {
    // Document switch → hard-reset the preview first so it re-renders from an
    // empty body rather than morphdom-diffing against the previous document
    // (which on large files left stale content at the top after switching).
    preview.reset()
    preview.render(content)
    statusBar.setText(content)
    if (activitybar.isActive('outline')) outline.refresh(content)
    // Prime the file-sync baseline synchronously from the read result. Without
    // this, the async recordMtime (fired by the tabs subscription) may not have
    // landed before the first checkTab, and checkTab would treat the post-open
    // disk state as the baseline — silently swallowing any external edit made
    // between open and that first check.
    if (stat) {
      const active = tabs.getActive()
      if (active?.filePath) fileSync.noteSaved(active.id, stat.mtimeMs, stat.size)
    }
  }
  // Reload a tab from disk when its file is modified externally (file-sync.ts).
  function reloadTabContent(tab: TabState, content: string): void {
    tabs.setContent(tab.id, content)
    if (tabs.getActive()?.id !== tab.id) {
      // Background tab: swapDoc only covers the active one, so explicitly drop
      // the editor's cached state — otherwise switching back would restore the
      // pre-reload document over the fresh content and a later save would
      // silently overwrite the external change.
      editor.invalidateTab(tab.id)
      return
    }
    const top = editor.getScrollTop()
    editor.swapDoc(content)
    editor.setScrollTop(top) // out-of-range values are clamped by the scroller
    presentContent(content)
  }
  const fileSync = createFileSync({ ctx, tabs, editor, reloadTab: reloadTabContent })
  // Created after fileSync so the snapshot can embed each tab's disk baseline
  // (see TabSnapshot.diskMtimeMs) — the first use is far below, at markDirty.
  const cache = createCacheManager({ ctx, tabs, editor, diskBaseline: fileSync.getBaseline })
  exposeForMainProcess(cache)
  const refreshOutlineDebounced = debounce((text: string) => {
    if (activitybar.isActive('outline')) outline.refresh(text)
  }, 150)
  function syncOutlineTitle(): void {
    const tab = tabs.getActive()
    outline.setTitle(tab?.title ?? '大纲')
  }
  ctx.store.activeTabId.subscribe(syncOutlineTitle)
  ctx.store.tabs.subscribe(syncOutlineTitle)
  ctx.store.activeTabId.subscribe(() => {
    const t = tabs.getActive()
    activitybar.onActiveTabChange(t?.filePath ?? null)
  })

  templatesPanel.onApply((content, name) => {
    const active = tabs.getActive()
    if (active && tabs.getContent(active.id).trim().length === 0) {
      // Apply into current empty tab
      editor.swapDoc(content)
      tabs.setContent(active.id, content)
      tabs.setTitle(active.id, name)
      // Applying a template is like loading a fresh document: an untitled tab
      // stays clean (dirty only after the first real edit, via onChange); a
      // file-backed tab does become dirty since the template overwrites disk.
      tabs.markModified(active.id, active.filePath ? content.length > 0 : false)
    } else {
      const tab = tabs.create({ title: name, content })
      tabs.setActive(tab.id)
      editor.openTab(tab.id, content)
      // New tab is untitled — clean until edited.
      tabs.markModified(tab.id, false)
    }
    presentContent(content)
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
    // status-bar text stats update via the debounced `updateStatus` subscriber
    // registered below (300ms) — running countWords/countChars synchronously on
    // every keystroke is the hot path that made large docs laggy.
    cache.markDirty()
    // schedule autosave to file for tabs with a real path
    scheduleAutosave()
  }
  editor.onChange(onChange)
  editor.onChange((value) => refreshOutlineDebounced(value))

  editor.onCursorChange(({ line, col, selection }) => statusBar.setCursor(line, col, selection))

  // ── Autosave: debounced per current autoSaveInterval setting ────────
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null
  // tabId → 失效时已警告过的 filePath;换路径后 key 错配自动重置,无需订阅清理
  const autosaveStaleWarned = new Map<string, string>()
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
    // Snapshot this tab's content BEFORE any await. An await yields to the
    // event loop, and the user may switch or close the tab during that gap —
    // reading editor.getValue() *after* the await would capture the now-active
    // tab's text and write it into THIS tab's file (cross-file corruption).
    // getContent(id) always holds this tab's own text (switchActive stores it
    // back on the way out), so it's safe across the await below.
    const content = tabs.getContent(tab.id)
    const filePath = tab.filePath
    const tabId = tab.id
    try {
      // serializeSave queues behind any manual save still writing this tab —
      // overlapping non-atomic writes could interleave or let the older
      // snapshot land last. create:false — fileSave refuses vanished paths
      // (moved: true) instead of resurrecting the file at the old location;
      // one IPC round-trip, no renderer-side pre-stat race window.
      const result = await serializeSave(tabId, async () => {
        ctx.store.saving.set(true)
        try {
          return await ctx.api.fileSave(filePath, content)
        } finally {
          ctx.store.saving.set(false)
        }
      })
      if (result.success) {
        // Only clear the dirty flag when the tab still holds the snapshot —
        // keystrokes during the write must stay "modified" for the next pass.
        if (tabs.getContent(tabId) === content) tabs.markModified(tabId, false)
        // Stamp the baseline with the post-write mtime/size straight from the
        // save result — synchronously, no second stat — so a focus-triggered
        // check can't slip in between the write and the baseline refresh and
        // false-fire "外部已更新".
        fileSync.noteSaved(tabId, result.mtimeMs, result.size)
        // "已保存 时间" 由 status-bar 订阅 saving signal(saving→false)统一驱动
      } else if (result.moved) {
        // 原路径已被外部移动/删除:静默跳过,每个失效片段仅提示一次。
        if (autosaveStaleWarned.get(tabId) !== filePath) {
          autosaveStaleWarned.set(tabId, filePath)
          showToast(`“${tab.title}” 的原路径已不存在,已跳过自动保存。请按 Ctrl+S 手动另存。`, 'error')
        }
      } else {
        showToast(`自动保存失败: ${result.error}`, 'error')
      }
    } catch (err) {
      showToast(`自动保存失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  // ── Theme signal → editor + body class + mermaid theme refresh ──────
  ctx.store.theme.subscribe((next) => {
    const eff = effectiveTheme(next)
    editor.setTheme(eff)
    applyThemeSideEffects(ctx, next)
    refreshMermaidTheme(eff)
  })
  // Re-apply when the OS theme changes while following the system. Must also
  // refresh the editor + mermaid themes, not just the body class.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (ctx.store.theme() !== 'auto') return
    const eff = effectiveTheme('auto')
    editor.setTheme(eff)
    applyThemeSideEffects(ctx, 'auto')
    refreshMermaidTheme(eff)
  })

  // ── Settings signal → CSS vars ──────────────────────────────────────
  ctx.store.settings.subscribe((next) => {
    document.documentElement.style.setProperty('--editor-font-size', `${next.fontSize}px`)
    document.documentElement.style.setProperty('--font-mono', next.editorFont)
    editor.setGutter(next.lineNumbers, next.codeFolding)
  })

  // ── Editor font size: Ctrl+= / Ctrl+- / Ctrl+0 and Ctrl+wheel ───────
  const FONT_MIN = 12
  const FONT_MAX = 28
  function setFontSize(next: number): void {
    const s = ctx.store.settings()
    const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(next)))
    if (clamped === s.fontSize) return
    // settings.set drives the subscriber above (CSS var) and persistence is
    // debounced by bindPersistence — nothing extra to do here.
    ctx.store.settings.set({ ...s, fontSize: clamped })
  }
  document.getElementById('editor-pane')?.addEventListener(
    'wheel',
    (evt) => {
      if (!evt.ctrlKey && !evt.metaKey) return
      evt.preventDefault() // pinch-zoom / Ctrl+wheel would otherwise zoom the page
      setFontSize(ctx.store.settings().fontSize + (evt.deltaY < 0 ? 1 : -1))
    },
    { passive: false },
  )

  // ── Focus mode → hide chrome + typewriter scrolling ─────────────────
  ctx.store.focusMode.subscribe((on) => {
    document.body.classList.toggle('focus-mode', on)
    editor.setTypewriter(on)
  })

  // ── Tab bar (event delegated) ───────────────────────────────────────
  const switchActive = (id: string): void => {
    const cur = ctx.store.activeTabId()
    if (cur === id) return
    if (cur) tabs.setContent(cur, editor.getValue())
    ctx.store.activeTabId.set(id)
    const content = tabs.getContent(id)
    editor.openTab(id, content)
    presentContent(content)
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
        // The modal only traps keyboard focus — the user can still click another
        // tab while it is open. Switch back so they see what is being saved;
        // the save itself is bound to `id`, so it targets this tab regardless.
        if (ctx.store.activeTabId() !== id) switchActive(id)
        const ok = await save(false, id)
        if (!ok) return false
      } else {
        // "不保存": let any in-flight/queued autosave for this tab drain
        // first, so its write can't land after the user chose to discard.
        await whenTabSaveSettled(id)
      }
    }
    tabs.close(id)
    editor.closeTab(id)
    const next = ctx.store.activeTabId()
    if (next) {
      const content = tabs.getContent(next)
      editor.openTab(next, content)
      presentContent(content)
    } else {
      editor.openTab(null, '')
      presentContent('')
      // No tabs left → welcome page shows; blur editor so keystrokes don't land in it.
      editor.blur()
    }
    return true
  }

  /**
   * Close several tabs at once ("close others" / "close right"). Each tab with
   * unsaved changes prompts save / discard / cancel; cancel aborts the rest of
   * the batch so nothing after it is touched. Replaces the old behaviour that
   * called tabs.close() directly and silently discarded unsaved edits.
   */
  async function closeMultiple(ids: string[], anchorId: string): Promise<void> {
    const originalActive = ctx.store.activeTabId()
    const confirmed: string[] = []
    for (const id of ids) {
      const tab = tabs.getById(id)
      if (!tab) continue
      if (tab.modified) {
        // Show the tab so the user sees what they would lose.
        if (ctx.store.activeTabId() !== id) switchActive(id)
        const choice = await showCloseConfirm({
          message: `"${tab.title}" 有未保存的更改,要保存吗?`,
        })
        if (choice === 'cancel') break
        if (choice === 'save') {
          // Same re-assert as closeTabAndUpdate: show what is being saved; the
          // save is bound to `id` regardless of the active tab.
          if (ctx.store.activeTabId() !== id) switchActive(id)
          const ok = await save(false, id)
          if (!ok) break
        } else {
          await whenTabSaveSettled(id)
        }
      }
      confirmed.push(id)
    }
    if (confirmed.length > 0) {
      confirmed.forEach((id) => {
        editor.closeTab(id)
        tabs.close(id)
      })
      // Land on the anchor tab and force its content into the editor. Don't use
      // switchActive() here: it short-circuits when the anchor is already active
      // (tabs.close often promotes it to the new active tab), which would leave
      // the editor showing the last closed tab's unsaved content attributed to
      // the anchor. We also skip persisting the outgoing tab, since the editor
      // currently holds a to-be-discarded tab's content.
      if (tabs.getById(anchorId)) {
        ctx.store.activeTabId.set(anchorId)
        const content = tabs.getContent(anchorId)
        editor.openTab(anchorId, content)
        presentContent(content)
      }
    } else if (originalActive && tabs.getById(originalActive)) {
      // Nothing was closed (user cancelled) → restore the tab we may have
      // switched away from while showing what would have been lost.
      switchActive(originalActive)
    }
  }

  mountTabBar({
    ctx,
    tabs,
    onActivate: switchActive,
    onClose: closeTabAndUpdate,
    onNewTab: () => newFile(),
    onCloseOthers(id) {
      void closeMultiple(
        tabs
          .getAll()
          .filter((t) => t.id !== id)
          .map((t) => t.id),
        id,
      )
    },
    onCloseRight(id) {
      const all = tabs.getAll()
      const idx = all.findIndex((t) => t.id === id)
      if (idx < 0) return
      void closeMultiple(
        all.slice(idx + 1).map((t) => t.id),
        id,
      )
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

      let done = false
      const commit = async (apply: boolean): Promise<void> => {
        if (done) return
        done = true
        if (input.parentElement) input.replaceWith(titleEl)
        if (!apply) return
        const raw = input.value.trim()
        if (!raw || raw === tab.title) return
        const safeName = sanitizeFileName(raw)
        if (!safeName) return
        if (!tab.filePath) {
          tabs.setTitle(id, safeName)
          return
        }
        const { dir, sep } = getDirAndSep(tab.filePath)
        const ext = getExtension(tab.filePath)
        const finalName = /\.[a-z0-9]+$/i.test(safeName) ? safeName : safeName + ext
        const newPath = (dir ? dir + sep : '') + finalName
        if (newPath === tab.filePath) {
          tabs.setTitle(id, safeName)
          return
        }
        const res = await ctx.api.fileRename(tab.filePath, newPath)
        if (!res.success) {
          showToast(`重命名失败: ${res.error}`, 'error')
          return
        }
        const oldPath = tab.filePath
        tabs.setTitle(id, titleFromPath(res.newPath), res.newPath)
        await recent.remove(oldPath)
        await recent.add(res.newPath)
      }
      input.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') void commit(true)
        if (evt.key === 'Escape') void commit(false)
      })
      input.addEventListener('blur', () => void commit(true))
    },
  })

  // ── Drag-drop + paste image ─────────────────────────────────────────
  attachDragDrop({
    ctx,
    tabs,
    editor,
    onAfterOpen: presentContent,
  })
  attachImagePaste({ ctx, editor, tabs })

  // ── Window controls ─────────────────────────────────────────────────
  attachWindowControls(ctx)

  // Re-check the active tab's file when the window regains focus — catches
  // external edits made while the app was in the background, without forcing
  // the user to switch tabs. Only acts on real mtime/size diffs, so this can't
  // introduce false positives. Tracked as a blurred→focused transition to avoid
  // firing on internal focus changes.
  let windowBlurred = false
  window.addEventListener('blur', () => {
    windowBlurred = true
  })
  window.addEventListener('focus', () => {
    if (!windowBlurred) return
    windowBlurred = false
    void fileSync.checkActiveTab()
  })

  // ── Restore from cache or create blank tab ──────────────────────────
  const snapshot = await cache.loadSnapshot()
  if (snapshot && snapshot.tabs.length > 0) {
    // Seed file-sync baselines from the flush-time disk state BEFORE the tabs
    // are created. applySnapshot's tab creations fire the file-sync
    // subscription, which live-stats each file and would adopt its current
    // on-disk state as the baseline — blind to changes made while the app
    // was closed. With the seed, the first activation check compares disk
    // against the flush-time state and runs the normal reload/prompt flow.
    for (const snap of snapshot.tabs) {
      if (
        snap.filePath &&
        typeof snap.diskMtimeMs === 'number' &&
        typeof snap.diskSize === 'number'
      ) {
        fileSync.seedFromSnapshot(snap.id, snap.filePath, snap.diskMtimeMs, snap.diskSize)
      }
    }
    await cache.applySnapshot(snapshot)
    const active = tabs.getActive()
    if (active) {
      const content = tabs.getContent(active.id)
      editor.openTab(active.id, content)
      presentContent(content)
    }
  } else {
    const tab = tabs.create({
      title: '未命名',
      content: '# 开始写作\n\n输入 Markdown，右侧实时预览。',
    })
    tabs.setActive(tab.id)
    const content = tabs.getContent(tab.id)
    editor.openTab(tab.id, content)
    presentContent(content)
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
    editor.openTab(tab.id, '')
    presentContent('')
    editor.focus()
  }
  async function openFile(): Promise<void> {
    await openFileViaDialog({
      ctx,
      tabs,
      editor,
      onContentLoaded(content, stat) {
        presentContent(content, stat)
        const active = tabs.getActive()
        if (active?.filePath) void recent.add(active.filePath)
      },
    })
  }
  /** Save the active tab, or an explicit tab by id (close-tab confirm flows —
   *  the save stays bound to that tab even if the user switches mid-flow). */
  async function save(saveAs = false, tabId?: string): Promise<boolean> {
    const result = await saveActiveTab({ ctx, tabs, tabId }, saveAs)
    if (result?.success) {
      const tab = tabId ? tabs.getById(tabId) : tabs.getActive()
      if (tab?.filePath) {
        await recent.add(tab.filePath)
        fileSync.noteSaved(tab.id, result.mtimeMs, result.size)
        showToast(`已保存: ${titleFromPath(tab.filePath)}`, 'success')
      }
    }
    return result?.success === true
  }

  // ── Toolbar buttons: v1 element IDs + v2 data-action delegation ─────
  const onBtnId = (id: string, fn: () => void): void => {
    document.getElementById(id)?.addEventListener('click', fn)
  }
  onBtnId('btn-new', newFile)
  onBtnId('btn-open', () => void openFile())
  onBtnId('btn-workspace', () => activitybar.toggleView('workspace'))
  onBtnId('btn-save', () => void save())
  onBtnId('btn-template', () => templatesPanel.open())
  onBtnId('btn-theme', () => ctx.store.theme.set(ctx.store.theme() === 'dark' ? 'light' : 'dark'))
  onBtnId('btn-settings', () => settingsPanel.open())
  onBtnId('btn-outline', () => activitybar.toggleView('outline'))
  onBtnId('btn-tab-new', () => {
    const tab = tabs.create({ title: '未命名' })
    tabs.setActive(tab.id)
    editor.openTab(tab.id, '')
    presentContent('')
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
  onBtnId('status-palette-hint', () => openPalette())
  // The hint ships as ⌘P; show Ctrl+P on the platforms whose keyboards have it.
  if (dom.statusPaletteHint) {
    dom.statusPaletteHint.textContent = ctx.api.platform === 'darwin' ? '⌘P' : 'Ctrl+P'
  }

  // v1 export menu (.export-wrap → .export-menu .export-item[data-type])
  const exportBtn = document.getElementById('btn-export')
  const exportMenu = document.getElementById('export-menu')
  function setExportMenuOpen(open: boolean): void {
    exportMenu?.classList.toggle('open', open)
    exportBtn?.setAttribute('aria-expanded', String(open))
    if (open) {
      // Focus the first item so arrow/Esc work immediately; return focus to the
      // toggle on close so keyboard users aren't dropped at the document root.
      exportMenu?.querySelector<HTMLElement>('.export-item')?.focus()
    } else if (document.activeElement instanceof HTMLElement && exportMenu?.contains(document.activeElement)) {
      exportBtn?.focus()
    }
  }
  exportBtn?.addEventListener('click', (evt) => {
    evt.stopPropagation()
    setExportMenuOpen(!exportMenu?.classList.contains('open'))
  })
  exportMenu?.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      evt.stopPropagation()
      setExportMenuOpen(false)
    }
  })
  document.addEventListener('click', () => setExportMenuOpen(false))
  document.querySelectorAll<HTMLElement>('.export-item').forEach((item) => {
    item.addEventListener('click', () => {
      setExportMenuOpen(false)
      const type = item.dataset.type
      const content = editor.getValue()
      const title = tabs.getActive()?.title ?? '未命名'
      if (type === 'md') void exportMarkdown({ ctx, content, title })
      else if (type === 'html') void exportHtml({ ctx, content, title, theme: effectiveTheme(ctx.store.theme()) })
      else if (type === 'pdf') void exportPdf({ ctx, content, title })
      else if (type === 'settings') settingsPanel.open()
    })
  })

  // v1 format buttons (.fmt-btn[data-action])
  document.querySelectorAll<HTMLElement>('.fmt-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action
      if (!action) return
      if (action === 'table') {
        const grid = await openTableGrid(btn)
        if (grid) editor.insertTable(grid.rows, grid.cols)
        return
      }
      editor.insertFormat(action as Parameters<typeof editor.insertFormat>[0])
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
        editor.openTab(tab.id, '')
        presentContent('')
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
        openPalette()
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
          theme: effectiveTheme(ctx.store.theme()),
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

    // Apply the persisted editor/preview split ratio, and let the divider be dragged.
    const applyDivider = (editorFrac: number): void => {
      const editorPane = document.getElementById('editor-pane')
      const previewPane = document.getElementById('preview-pane')
      if (!editorPane || !previewPane) return
      editorPane.style.flexGrow = String(editorFrac)
      previewPane.style.flexGrow = String(1 - editorFrac)
    }
    const storedDivider = ctx.store.dividerPos()
    if (storedDivider > 0) applyDivider(storedDivider)

    const dividerEl = document.getElementById('divider')
    let lastDragFrac = 0
    dividerEl?.addEventListener('pointerdown', (e) => {
      if (ctx.store.viewMode() !== 'split') return
      e.preventDefault()
      const mainAreaEl = dom.mainArea!
      const onMove = (ev: PointerEvent): void => {
        const rect = mainAreaEl.getBoundingClientRect()
        // The split lives in the content box — subtract the sidebar's padding-left
        // (240px when the workspace is open) so the fraction matches the visuals.
        const padLeft = parseFloat(getComputedStyle(mainAreaEl).paddingLeft) || 0
        const contentWidth = Math.max(1, rect.width - padLeft)
        const leftFrac = Math.max(0.15, Math.min(0.85, (ev.clientX - rect.left - padLeft) / contentWidth))
        // paneOrder physically reorders panes, so the editor may be on either side.
        const editorOnLeft = dividerEl.previousElementSibling?.id === 'editor-pane'
        lastDragFrac = editorOnLeft ? leftFrac : 1 - leftFrac
        applyDivider(lastDragFrac)
      }
      const onUp = (): void => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.body.classList.remove('divider-dragging')
        if (lastDragFrac > 0) ctx.store.dividerPos.set(lastDragFrac)
      }
      document.body.classList.add('divider-dragging')
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    })
    // Keyboard nudge (arrows ±2%, Home/End to the clamp bounds) and double-click
    // reset — mirroring the workspace resizer's dblclick-to-default behavior.
    const nudgeDivider = (delta: number | 'home' | 'end'): void => {
      if (ctx.store.viewMode() !== 'split') return
      const cur = lastDragFrac > 0 ? lastDragFrac : ctx.store.dividerPos() || 0.5
      const next =
        delta === 'home' ? 0.15 : delta === 'end' ? 0.85 : Math.max(0.15, Math.min(0.85, cur + delta))
      lastDragFrac = next
      applyDivider(next)
      ctx.store.dividerPos.set(next)
    }
    dividerEl?.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.05 : 0.02
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          nudgeDivider(-step)
          break
        case 'ArrowRight':
          e.preventDefault()
          nudgeDivider(step)
          break
        case 'Home':
          e.preventDefault()
          nudgeDivider('home')
          break
        case 'End':
          e.preventDefault()
          nudgeDivider('end')
          break
      }
    })
    dividerEl?.addEventListener('dblclick', () => {
      lastDragFrac = 0.5
      applyDivider(0.5)
      ctx.store.dividerPos.set(0.5)
    })
  }

  // ── Find ────────────────────────────────────────────────────────────
  const find = attachFind(editor.view)
  // Right-click inside a GFM table → row/column/alignment menu.
  attachTableMenu(editor.view)
  installModalFocusTrap()
  // Overflow "⋯" for toolbar buttons that don't fit the row (after all buttons
  // above are bound, since menu items re-dispatch clicks on the originals).
  initToolbarOverflow()

  function reopenClosedTab(): void {
    const tab = tabs.reopenLast()
    if (!tab) return
    const content = tabs.getContent(tab.id)
    editor.openTab(tab.id, content)
    presentContent(content)
  }

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
    hint: 'Ctrl+Shift+L',
    run: () => ctx.store.theme.set(ctx.store.theme() === 'dark' ? 'light' : 'dark'),
  })
  palette.register({ id: 'tab.reopen', group: '标签', title: '重开已关闭的标签', hint: 'Ctrl+Shift+T', run: reopenClosedTab })
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
    run: () => activitybar.toggleView('outline'),
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
        theme: effectiveTheme(ctx.store.theme()),
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
  palette.register({
    id: 'edit.copy-rich',
    group: '导出',
    title: '复制为富文本（可粘贴到公众号/Word）',
    hint: 'Ctrl+Alt+C',
    run: () =>
      void copyRichText({
        ctx,
        getContent: () => editor.getValue(),
      }),
  })
  palette.register({
    id: 'view.focus',
    group: '视图',
    title: '专注模式',
    hint: 'Ctrl+Shift+F',
    run: () => ctx.store.focusMode.set(!ctx.store.focusMode()),
  })
  palette.register({
    id: 'workspace.toggle',
    group: '视图',
    title: '收起/展开工作区面板',
    hint: 'Ctrl+Shift+E',
    run: () => activitybar.toggleView('workspace'),
  })
  palette.register({
    id: 'workspace.search',
    group: '工作区',
    title: '搜索工作区内容…',
    hint: 'Ctrl+Shift+H',
    run: () => activitybar.openView('search'),
  })

  // ── Palette file quick-open ─────────────────────────────────────────
  // Ctrl+P opens the palette; workspace markdown files are mixed into it as
  // dynamic commands (fuzzy over their relative paths). Indexed lazily with
  // a short TTL so tree changes surface without a per-keystroke IPC walk.
  const QUICK_FILE_PREFIX = 'quickfile:'
  const QUICK_FILE_TTL_MS = 30_000
  const QUICK_FILE_CAP = 500
  const quickFileIds = new Set<string>()
  let quickFileIndexedAt = 0
  function refreshQuickFileCommands(): Promise<void> {
    if (Date.now() - quickFileIndexedAt < QUICK_FILE_TTL_MS) return Promise.resolve()
    quickFileIndexedAt = Date.now() // pessimistic stamp: failures also wait out the TTL
    return (async () => {
      const res = await ctx.api.workspaceListAll()
      if (!res.success) return
      for (const id of quickFileIds) palette.unregister(id)
      quickFileIds.clear()
      const rootN = res.root.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
      for (const p of res.files.slice(0, QUICK_FILE_CAP)) {
        const id = QUICK_FILE_PREFIX + p
        const rel = p.replace(/\\/g, '/').startsWith(rootN)
          ? p.replace(/\\/g, '/').slice(rootN.length)
          : p
        palette.register({
          id,
          group: '文件',
          title: rel,
          run: () =>
            void openFileByPath({ ctx, tabs, editor, onContentLoaded: presentContent }, p),
        })
        quickFileIds.add(id)
      }
      // The palette may already be open — re-filter so the files show up now.
      palette.refresh()
    })().catch(() => {
      /* index refresh is best-effort */
    })
  }
  function openPalette(): void {
    void refreshQuickFileCommands()
    palette.open()
  }
  palette.register({
    id: 'workspace.openFolder',
    group: '文件',
    title: '打开/切换工作区文件夹',
    run: () => void workspacePanel.open(),
  })

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && ctx.store.focusMode()) {
      ctx.store.focusMode.set(false)
      return
    }
    const ctrl = evt.ctrlKey || evt.metaKey
    if (!ctrl) return
    const key = evt.key.toLowerCase()

    if (key === 's') {
      evt.preventDefault()
      // OS key auto-repeat fires keydown ~30/s; a save per event would stack
      // concurrent writes. The in-flight save already has the latest content.
      if (evt.repeat) return
      void save(evt.shiftKey)
    } else if (key === '=' || key === '+') {
      evt.preventDefault()
      setFontSize(ctx.store.settings().fontSize + 1)
    } else if (key === '-') {
      evt.preventDefault()
      setFontSize(ctx.store.settings().fontSize - 1)
    } else if (key === '0') {
      evt.preventDefault()
      setFontSize(DEFAULT_SETTINGS.fontSize)
    } else if (key === 'c' && evt.altKey) {
      // Ctrl+Alt+C — 复制为富文本 (Ctrl+C stays the native plain copy)
      evt.preventDefault()
      void copyRichText({ ctx, getContent: () => editor.getValue() })
    } else if (key === 'n' && !evt.shiftKey) {
      evt.preventDefault()
      newFile()
    } else if (key === 'o' && !evt.shiftKey) {
      evt.preventDefault()
      void openFile()
    } else if (key === 'r' && evt.shiftKey) {
      evt.preventDefault()
      void recentPanel.open()
    } else if (key === 'p' && evt.shiftKey) {
      // Ctrl+Shift+P → palette (Ctrl+K is reserved for link insert)
      evt.preventDefault()
      openPalette()
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
      if (tab) void closeTabAndUpdate(tab.id)
    } else if (key === 't' && !evt.shiftKey) {
      evt.preventDefault()
      const tab = tabs.create({ title: '未命名' })
      tabs.setActive(tab.id)
      editor.openTab(tab.id, '')
      presentContent('')
    } else if (key === 'tab') {
      evt.preventDefault()
      const all = tabs.getAll()
      if (all.length === 0) return
      const cur = ctx.store.activeTabId()
      const curIdx = cur ? all.findIndex((t) => t.id === cur) : 0
      const dir = evt.shiftKey ? -1 : 1
      const next = all[(curIdx + dir + all.length) % all.length]
      ctx.store.activeTabId.set(next.id)
      const content = tabs.getContent(next.id)
      editor.openTab(next.id, content)
      presentContent(content)
    } else if (key >= '1' && key <= '9') {
      evt.preventDefault()
      const idx = parseInt(key, 10) - 1
      const all = tabs.getAll()
      // Route through switchActive so the editor + preview swap to the target
      // tab — a bare activeTabId.set left the editor showing the old tab while
      // active pointed at the new one, so typing wrote into the wrong tab.
      if (all[idx]) switchActive(all[idx].id)
    } else if (evt.shiftKey && key === 'f') {
      evt.preventDefault()
      ctx.store.focusMode.set(!ctx.store.focusMode())
    } else if (evt.shiftKey && key === 'e') {
      evt.preventDefault()
      activitybar.toggleView('workspace')
    } else if (evt.shiftKey && key === 'l') {
      evt.preventDefault()
      ctx.store.theme.set(ctx.store.theme() === 'dark' ? 'light' : 'dark')
    } else if (evt.shiftKey && key === 't') {
      evt.preventDefault()
      reopenClosedTab()
    } else if (evt.shiftKey && (key === '/' || key === '?')) {
      evt.preventDefault()
      settingsPanel.open('shortcuts')
    } else if (evt.shiftKey && key === 'o') {
      evt.preventDefault()
      activitybar.toggleView('outline')
    } else if (evt.shiftKey && key === 'h') {
      evt.preventDefault()
      activitybar.openView('search')
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
          theme: effectiveTheme(ctx.store.theme()),
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
      case 'menu:toggle-focus':
        ctx.store.focusMode.set(!ctx.store.focusMode())
        break
      case 'menu:open-workspace':
        void workspacePanel.open()
        break
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
      // Just focus the already-open tab. Don't overwrite the editor with the OS
      // payload — that would discard unsaved edits and desync contents (the
      // programmatic setValue doesn't fire onChange, so contents[existing]
      // would keep its stale value). If the file changed on disk since, the
      // activeTabId change fires file-sync's checkActiveTab, which prompts.
      switchActive(existing.id)
      return
    }
    const tab = tabs.create({ title: titleFromPath(name) || '未命名', filePath, content })
    tabs.setActive(tab.id)
    tabs.markModified(tab.id, false)
    editor.openTab(tab.id, content)
    presentContent(content)
    void recent.add(filePath)
  })

  ctx.api.onOpenFileError(({ error }) => {
    showToast(`打开文件失败: ${error}`, 'error')
  })

  // Cold-launch handshake: if the app was opened by double-clicking a file, the
  // main process queued it but could not deliver it (the listener above didn't
  // exist yet at did-finish-load). Tell main we're now ready so it can flush any
  // pending file. No-op when nothing is queued.
  void ctx.api.requestPendingFile()

  // ── Debounced status-bar update for typing ──────────────────────────
  const updateStatus = debounce((value: string) => statusBar.setText(value), 300)
  editor.onChange((value) => updateStatus(value))

  editor.focus()
}

void bootstrap().catch((err) => {
  console.error('[bootstrap] failed:', err)
  document.body.innerHTML = `<pre style="padding:20px;color:red">启动失败: ${
    err instanceof Error ? err.message : String(err)
  }</pre>`
})
