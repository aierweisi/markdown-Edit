import type { AppContext } from '../context'
import type { Settings, Theme } from '@shared/types'
import { renderShortcutsHTML } from './shortcuts-panel'
import { showConfirm } from './confirm-modal'
import { showToast } from './toast'

const PANELS = ['appearance', 'editor', 'autosave', 'export', 'system', 'shortcuts'] as const
type PanelId = (typeof PANELS)[number]

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
}

export function createSettingsPanel(ctx: AppContext): SettingsPanelApi {
  let overlay: HTMLElement | null = null
  let escapeHandler: ((evt: KeyboardEvent) => void) | null = null

  function ensureBuilt(): HTMLElement {
    if (overlay) return overlay
    overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.id = 'settings-overlay'
    overlay.innerHTML = `
      <div class="modal modal--settings">
        <header class="modal__header">
          <h2>设置</h2>
          <button type="button" class="modal__close" data-act="close">✕</button>
        </header>
        <div class="settings__body">
          <nav class="settings__nav">
            <button type="button" data-panel="appearance" class="settings__nav-item">外观</button>
            <button type="button" data-panel="editor" class="settings__nav-item">编辑器</button>
            <button type="button" data-panel="autosave" class="settings__nav-item">自动保存</button>
            <button type="button" data-panel="export" class="settings__nav-item">导出</button>
            <button type="button" data-panel="system" class="settings__nav-item">系统</button>
            <button type="button" data-panel="shortcuts" class="settings__nav-item">快捷键</button>
          </nav>
          <div class="settings__panels">
            ${appearancePanel()}
            ${editorPanel()}
            ${autosavePanel()}
            ${exportPanel()}
            ${systemPanel()}
            ${shortcutsPanel()}
          </div>
        </div>
        <footer class="modal__footer">
          <span class="modal__footer-hint">Ctrl+Shift+T 快速切换主题</span>
          <div class="modal__footer-actions">
            <button type="button" class="btn btn--danger" data-act="reset">重置默认值</button>
            <button type="button" class="btn btn--primary" data-act="save">保存设置</button>
          </div>
        </footer>
      </div>`
    document.body.appendChild(overlay)
    bind()
    return overlay
  }

  function bind(): void {
    if (!overlay) return
    overlay.addEventListener('click', (evt) => {
      const t = evt.target as HTMLElement
      const act = t.dataset.act
      if (act === 'close' || evt.target === overlay) close()
      if (act === 'save') void save()
      if (act === 'reset') void reset()

      const panel = t.dataset.panel
      if (panel) switchPanel(panel as PanelId)

      const theme = t.dataset.theme
      if (theme) overlay!.querySelectorAll('[data-theme]').forEach((el) => {
        el.classList.toggle('active', (el as HTMLElement).dataset.theme === theme)
      })
    })
  }

  function switchPanel(id: PanelId): void {
    if (!overlay) return
    overlay.querySelectorAll<HTMLElement>('.settings__nav-item').forEach((el) => {
      el.classList.toggle('settings__nav-item--active', el.dataset.panel === id)
    })
    overlay.querySelectorAll<HTMLElement>('.settings__panel').forEach((el) => {
      el.classList.toggle('settings__panel--active', el.id === `panel-${id}`)
    })
  }

  function fillForm(s: Settings): void {
    if (!overlay) return
    overlay.querySelectorAll<HTMLElement>('[data-theme]').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.theme === s.theme)
    })
    setInput('setting-fontsize', String(s.fontSize))
    setInput('setting-editorfont', s.editorFont)
    setInput('setting-autosave', String(s.autoSaveInterval))
    setInput('setting-exportdir', s.exportDir)
    setInput('setting-namingrule', s.exportNamingRule)
    setInput('setting-imagedir', s.imageSaveDir)
  }

  async function save(): Promise<void> {
    if (!overlay) return
    const active = overlay.querySelector<HTMLElement>('[data-theme].active')
    const next: Settings = {
      theme: ((active?.dataset.theme as Theme) ?? 'light'),
      fontSize: parseInt(getInput('setting-fontsize') || '15', 10),
      editorFont: getInput('setting-editorfont') || DEFAULTS.editorFont,
      autoSaveInterval: parseInt(getInput('setting-autosave') || '10', 10),
      exportDir: getInput('setting-exportdir'),
      exportNamingRule: getInput('setting-namingrule') || '{title}_{date}',
      imageSaveDir: getInput('setting-imagedir').trim() || 'assets',
      paneOrder: ctx.store.settings().paneOrder,
    }

    ctx.store.settings.set(next)
    ctx.store.theme.set(next.theme)
    ctx.store.autosaveMs.set(next.autoSaveInterval * 1000)
    showToast('设置已保存', 'success')
    close()
  }

  async function reset(): Promise<void> {
    if (!(await showConfirm({ message: '重置所有设置为默认值？', okText: '重置', danger: true }))) {
      return
    }
    ctx.store.settings.set(DEFAULTS)
    ctx.store.theme.set(DEFAULTS.theme)
    ctx.store.autosaveMs.set(DEFAULTS.autoSaveInterval * 1000)
    fillForm(DEFAULTS)
    showToast('设置已重置', 'info')
  }

  function close(): void {
    overlay?.classList.remove('modal-overlay--open')
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler)
      escapeHandler = null
    }
  }

  return {
    open(panel = 'appearance') {
      ensureBuilt()
      fillForm(ctx.store.settings())
      switchPanel(panel)
      overlay!.classList.add('modal-overlay--open')
      escapeHandler = (evt) => {
        if (evt.key === 'Escape') close()
      }
      document.addEventListener('keydown', escapeHandler)
    },
    close,
  }
}

function getInput(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
  return el?.value ?? ''
}

function setInput(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
  if (el) el.value = value
}

function appearancePanel(): string {
  return `
    <section class="settings__panel settings__panel--active" id="panel-appearance">
      <h3>外观</h3>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">主题</div>
          <div class="setting-row__desc">选择界面的明暗风格</div>
        </div>
        <div class="theme-toggle">
          <button type="button" data-theme="light">浅色</button>
          <button type="button" data-theme="dark">深色</button>
        </div>
      </div>
    </section>`
}

function editorPanel(): string {
  return `
    <section class="settings__panel" id="panel-editor">
      <h3>编辑器</h3>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">字体大小</div>
          <div class="setting-row__desc">编辑区代码字号</div>
        </div>
        <input type="number" id="setting-fontsize" min="10" max="32" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">编辑器字体</div>
          <div class="setting-row__desc">等宽字体影响代码可读性</div>
        </div>
        <select id="setting-editorfont">
          <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
          <option value="'Fira Code', monospace">Fira Code</option>
          <option value="'Source Code Pro', monospace">Source Code Pro</option>
          <option value="Consolas, monospace">Consolas</option>
          <option value="monospace">系统等宽</option>
        </select>
      </div>
    </section>`
}

function autosavePanel(): string {
  return `
    <section class="settings__panel" id="panel-autosave">
      <h3>自动保存</h3>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">自动保存间隔</div>
          <div class="setting-row__desc">每隔多少秒触发文件自动保存与缓存写入</div>
        </div>
        <input type="number" id="setting-autosave" min="5" max="300" />
      </div>
    </section>`
}

function exportPanel(): string {
  return `
    <section class="settings__panel" id="panel-export">
      <h3>导出</h3>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">默认导出目录</div>
          <div class="setting-row__desc">每次导出时优先使用此目录</div>
        </div>
        <input type="text" id="setting-exportdir" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">粘贴图片保存目录</div>
          <div class="setting-row__desc">相对路径相对当前文档；绝对路径全局统一保存</div>
        </div>
        <input type="text" id="setting-imagedir" placeholder="assets" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">文件命名规则</div>
          <div class="setting-row__desc">可用 {title} {date} {time} {datetime} {timestamp} {random}</div>
        </div>
        <input type="text" id="setting-namingrule" placeholder="{title}_{date}" />
      </div>
    </section>`
}

function systemPanel(): string {
  return `
    <section class="settings__panel" id="panel-system">
      <h3>系统</h3>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">清空缓存</div>
          <div class="setting-row__desc">清理 HTTP/代码/GPU 缓存与本地存储（不影响设置与文档）</div>
        </div>
        <button type="button" class="btn btn--secondary" data-act="clear-cache">清空</button>
      </div>
    </section>`
}

function shortcutsPanel(): string {
  return `
    <section class="settings__panel" id="panel-shortcuts">
      <h3>快捷键</h3>
      <div class="shortcuts">
        ${renderShortcutsHTML()}
      </div>
    </section>`
}
