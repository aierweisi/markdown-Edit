import { collectDomRefs } from './dom'
import { createAppContext } from './context'
import { createAppStore } from './state/app-store'
import { bindPersistence } from './state/persist'
import { createEditor } from './editor/editor-api'
import { createPreview } from './preview/render'
import { createTabManager } from './tabs/tab-manager'
import { mountTabBar } from './tabs/tab-bar'
import type { Settings } from '@shared/types'
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

  document.body.classList.toggle('theme-dark', settings.theme === 'dark')
  document.body.classList.toggle('theme-light', settings.theme !== 'dark')

  bindPersistence(store)

  const tabs = createTabManager(ctx)

  if (!dom.editorContainer) {
    document.body.innerHTML = '<p>missing editor container</p>'
    return
  }

  const initialTab = tabs.create({ title: '未命名', content: '# 开始写作\n\n输入 Markdown，右侧实时预览。' })
  tabs.setActive(initialTab.id)

  const editor = createEditor({
    parent: dom.editorContainer,
    theme: settings.theme,
    initialValue: tabs.getContent(initialTab.id),
  })

  const preview =
    dom.previewBody &&
    createPreview({
      body: dom.previewBody,
    })

  editor.onChange((value) => {
    const active = ctx.store.activeTabId()
    if (active) {
      tabs.setContent(active, value)
      const tab = tabs.getById(active)
      if (tab && !tab.modified) tabs.markModified(active, true)
    }
    preview?.render(value)
  })

  // initial render
  preview?.render(editor.getValue())

  // theme effect: sync editor + body class whenever theme signal changes
  ctx.store.theme.subscribe((next) => {
    editor.setTheme(next)
    document.body.classList.toggle('theme-dark', next === 'dark')
    document.body.classList.toggle('theme-light', next !== 'dark')
  })

  // mount tab bar (event-delegated)
  mountTabBar({
    ctx,
    tabs,
    onActivate(id) {
      const cur = ctx.store.activeTabId()
      if (cur === id) return
      ctx.store.activeTabId.set(id)
      editor.setValue(tabs.getContent(id))
      preview?.render(tabs.getContent(id))
    },
    onClose(id) {
      tabs.close(id)
      const newActive = ctx.store.activeTabId()
      if (newActive) {
        editor.setValue(tabs.getContent(newActive))
        preview?.render(tabs.getContent(newActive))
      } else {
        editor.setValue('')
        preview?.render('')
      }
    },
  })

  // wire toolbar buttons (only the few that exist in this minimal HTML)
  document.querySelectorAll<HTMLElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action
      if (!action) return
      if (action === 'toggle-theme') {
        const next = ctx.store.theme() === 'dark' ? 'light' : 'dark'
        ctx.store.theme.set(next)
      } else if (action === 'tab-new') {
        const tab = tabs.create({ title: '未命名' })
        tabs.setActive(tab.id)
        editor.setValue('')
        preview?.render('')
        editor.focus()
      } else if (action) {
        // delegated to editor.insertFormat
        try {
          editor.insertFormat(action as Parameters<typeof editor.insertFormat>[0])
        } catch {
          /* unknown action */
        }
      }
    })
  })

  editor.focus()
}

void bootstrap().catch((err) => {
  console.error('[bootstrap] failed:', err)
  document.body.innerHTML = `<pre style="padding:20px;color:red">Bootstrap failed: ${
    err instanceof Error ? err.message : String(err)
  }</pre>`
})
