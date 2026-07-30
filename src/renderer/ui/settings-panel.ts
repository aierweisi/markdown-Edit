import type { AppContext } from '../context'
import type { Settings, Theme } from '@shared/types'
import { renderShortcutsHTML } from './shortcuts-panel'
import { showConfirm } from './confirm-modal'
import { showToast } from './toast'

type PanelId = 'appearance' | 'editor' | 'autosave' | 'export' | 'system' | 'shortcuts'

export interface SettingsPanelApi {
  open(panel?: PanelId): void
  close(): void
}

const DEFAULTS: Settings = {
  theme: 'light',
  fontSize: 15,
  editorFont: "'JetBrains Mono', 'Fira Code', monospace",
  autoSaveInterval: 10,
  exportDir: '',
  exportNamingRule: '{title}_{date}',
  imageSaveDir: 'assets',
  paneOrder: 'preview-first',
  lineNumbers: true,
  codeFolding: true,
  imageCompressEnabled: true,
  imageCompressMaxSize: 1920,
  imageCompressQuality: 0.85,
  statusBar: { cursor: true, selection: true, readtime: true, chars: true, autosave: true },
}

const CLEAR_BTN_RESET_DELAY = 2200

/**
 * Drives the v1 settings modal (#settings-overlay) already present in
 * index.html. Operates on existing DOM, never creates its own overlay.
 */
export function createSettingsPanel(ctx: AppContext): SettingsPanelApi {
  let escapeHandler: ((evt: KeyboardEvent) => void) | null = null
  let bound = false

  function $(id: string): HTMLElement | null {
    return document.getElementById(id)
  }

  function switchPanel(id: PanelId): void {
    document.querySelectorAll<HTMLElement>('.settings-nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.panel === id)
    })
    document.querySelectorAll<HTMLElement>('.settings-panel').forEach((el) => {
      el.classList.toggle('active', el.id === `panel-${id}`)
    })
    if (id === 'shortcuts') ensureShortcutsRendered()
  }

  function ensureShortcutsRendered(): void {
    const host = $('panel-shortcuts-content')
    if (host && host.innerHTML.trim() === '') {
      host.innerHTML = renderShortcutsHTML()
    }
  }

  function syncThemeButtons(theme: Theme): void {
    document.querySelectorAll<HTMLElement>('.theme-toggle-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === theme)
    })
  }

  function fillForm(s: Settings): void {
    syncThemeButtons(s.theme)
    setVal('setting-fontsize', String(s.fontSize))
    setVal('setting-editorfont', s.editorFont)
    setVal('setting-autosave', String(s.autoSaveInterval))
    setVal('setting-exportdir', s.exportDir)
    setVal('setting-namingrule', s.exportNamingRule)
    setVal('setting-imagedir', s.imageSaveDir)
    setChecked('setting-linenumbers', s.lineNumbers)
    setChecked('setting-codefolding', s.codeFolding)
    setChecked('setting-imgcompress-enabled', s.imageCompressEnabled)
    setVal('setting-imgcompress-size', String(s.imageCompressMaxSize))
    setVal('setting-imgcompress-quality', String(s.imageCompressQuality))
    setChecked('setting-status-cursor', s.statusBar.cursor)
    setChecked('setting-status-selection', s.statusBar.selection)
    setChecked('setting-status-readtime', s.statusBar.readtime)
    setChecked('setting-status-chars', s.statusBar.chars)
    setChecked('setting-status-autosave', s.statusBar.autosave)
  }

  function readForm(): Settings {
    const activeTheme = document.querySelector<HTMLElement>('.theme-toggle-btn.active')
    return {
      theme: (activeTheme?.dataset.theme as Theme) ?? 'light',
      fontSize: parseInt(getVal('setting-fontsize') || '15', 10),
      editorFont: getVal('setting-editorfont') || DEFAULTS.editorFont,
      autoSaveInterval: parseInt(getVal('setting-autosave') || '10', 10),
      exportDir: getVal('setting-exportdir'),
      exportNamingRule: getVal('setting-namingrule').trim() || '{title}_{date}',
      imageSaveDir: getVal('setting-imagedir').trim() || 'assets',
      paneOrder: ctx.store.settings().paneOrder,
      lineNumbers: getChecked('setting-linenumbers'),
      codeFolding: getChecked('setting-codefolding'),
      imageCompressEnabled: getChecked('setting-imgcompress-enabled'),
      imageCompressMaxSize: parseInt(getVal('setting-imgcompress-size') || '1920', 10),
      imageCompressQuality: parseFloat(getVal('setting-imgcompress-quality') || '0.85'),
      statusBar: {
        cursor: getChecked('setting-status-cursor'),
        selection: getChecked('setting-status-selection'),
        readtime: getChecked('setting-status-readtime'),
        chars: getChecked('setting-status-chars'),
        autosave: getChecked('setting-status-autosave'),
      },
    }
  }

  function save(): void {
    const next = readForm()
    ctx.store.settings.set(next)
    ctx.store.theme.set(next.theme)
    ctx.store.autosaveMs.set(next.autoSaveInterval * 1000)
    close()
    showToast('设置已保存', 'success')
  }

  async function reset(): Promise<void> {
    const ok = await showConfirm({
      title: '重置设置',
      message: '重置所有设置为默认值？',
      okText: '重置',
      danger: true,
    })
    if (!ok) return
    ctx.store.settings.set(DEFAULTS)
    ctx.store.theme.set(DEFAULTS.theme)
    ctx.store.autosaveMs.set(DEFAULTS.autoSaveInterval * 1000)
    close()
    showToast('设置已重置', 'info')
  }

  function close(): void {
    const overlay = $('settings-overlay')
    if (!overlay) return
    overlay.classList.remove('open')
    overlay.classList.add('closing')
    setTimeout(() => overlay.classList.remove('closing'), 200)
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler)
      escapeHandler = null
    }
  }

  function bind(): void {
    if (bound) return
    bound = true
    const overlay = $('settings-overlay')
    if (!overlay) return

    $('settings-close')?.addEventListener('click', close)
    $('settings-save-btn')?.addEventListener('click', save)
    $('settings-reset-btn')?.addEventListener('click', () => void reset())

    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) close()
    })

    // Inject a shortcuts nav item + panel if v1 HTML doesn't have one.
    const navHost = overlay.querySelector<HTMLElement>('.settings-nav')
    if (navHost && !navHost.querySelector('[data-panel="shortcuts"]')) {
      const item = document.createElement('div')
      item.className = 'settings-nav-item'
      item.dataset.panel = 'shortcuts'
      item.innerHTML = '<span class="nav-icon">⌨</span> 快捷键'
      navHost.appendChild(item)
    }
    const panelsHost = overlay.querySelector<HTMLElement>('.settings-panels')
    if (panelsHost && !$('panel-shortcuts')) {
      const panel = document.createElement('div')
      panel.className = 'settings-panel'
      panel.id = 'panel-shortcuts'
      panel.innerHTML =
        '<div class="settings-panel-title">快捷键</div>' +
        '<div id="panel-shortcuts-content" class="shortcuts-panel-wrap"></div>'
      panelsHost.appendChild(panel)
    }

    document.querySelectorAll<HTMLElement>('.settings-nav-item').forEach((el) => {
      el.addEventListener('click', () => switchPanel(el.dataset.panel as PanelId))
    })

    document.querySelectorAll<HTMLElement>('.theme-toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll<HTMLElement>('.theme-toggle-btn').forEach((b) =>
          b.classList.remove('active'),
        )
        btn.classList.add('active')
      })
    })

    document.querySelectorAll<HTMLElement>('.naming-var-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = $('setting-namingrule') as HTMLInputElement | null
        if (!input) return
        const varStr = chip.dataset.var ?? ''
        const s = input.selectionStart ?? input.value.length
        const e = input.selectionEnd ?? input.value.length
        input.value = input.value.slice(0, s) + varStr + input.value.slice(e)
        const pos = s + varStr.length
        input.setSelectionRange(pos, pos)
        input.focus()
      })
    })

    $('setting-exportdir-btn')?.addEventListener('click', async () => {
      const result = await ctx.api.dialogSelectDir()
      if (!result.canceled && result.filePaths.length) {
        const input = $('setting-exportdir') as HTMLInputElement | null
        if (input) input.value = result.filePaths[0]
      }
    })
    $('setting-imagedir-btn')?.addEventListener('click', async () => {
      const result = await ctx.api.dialogSelectDir()
      if (!result.canceled && result.filePaths.length) {
        const input = $('setting-imagedir') as HTMLInputElement | null
        if (input) input.value = result.filePaths[0]
      }
    })

    const clearBtn = $('setting-clear-cache-btn') as HTMLButtonElement | null
    clearBtn?.addEventListener('click', async () => {
      const ok = await showConfirm({
        title: '清空缓存',
        message: '确定清空缓存?将清理 HTTP/代码/GPU 缓存与本地存储,不影响您的设置和文档。',
        okText: '清空',
        danger: true,
      })
      if (!ok) return
      const orig = clearBtn.textContent ?? '清空'
      clearBtn.disabled = true
      clearBtn.textContent = '清理中…'
      const result = await ctx.api.clearCache()
      clearBtn.disabled = false
      if (result.success) {
        const freedMb = (result.freed / 1024 / 1024).toFixed(1)
        clearBtn.textContent = `已清空 (释放 ${freedMb} MB)`
        showToast(`缓存已清空 (释放 ${freedMb} MB)`, 'success')
      } else {
        clearBtn.textContent = '清空失败'
        showToast(`清空缓存失败: ${result.error}`, 'error')
      }
      setTimeout(() => (clearBtn.textContent = orig), CLEAR_BTN_RESET_DELAY)
    })
  }

  return {
    open(panel = 'appearance') {
      bind()
      fillForm(ctx.store.settings())
      switchPanel(panel)
      $('settings-overlay')?.classList.add('open')
      escapeHandler = (evt) => {
        if (evt.key === 'Escape') close()
      }
      document.addEventListener('keydown', escapeHandler)
    },
    close,
  }
}

function getVal(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
  return el?.value ?? ''
}

function setVal(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
  if (el) el.value = value
}

function getChecked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement | null)?.checked ?? false
}

function setChecked(id: string, value: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null
  if (el) el.checked = value
}
