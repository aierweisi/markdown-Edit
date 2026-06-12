import type { AppContext } from '../context'
import type { Template } from '@shared/types'
import { showConfirm } from './confirm-modal'

export interface TemplatesPanelApi {
  open(): void
  close(): void
  onApply(cb: (content: string, name: string) => void): void
}

function makeId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function createTemplatesPanel(ctx: AppContext): TemplatesPanelApi {
  let overlay: HTMLElement | null = null
  let escHandler: ((evt: KeyboardEvent) => void) | null = null
  let templates: Template[] = []
  let selectedId: string | null = null
  let applyListeners = new Set<(content: string, name: string) => void>()

  async function load(): Promise<void> {
    templates = (await ctx.api.storeGet('templates')) ?? []
  }

  async function save(): Promise<void> {
    await ctx.api.storeSet('templates', templates)
  }

  function build(): void {
    overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal modal--templates">
        <header class="modal__header">
          <h2>模板库</h2>
          <button type="button" class="modal__close" data-act="close">✕</button>
        </header>
        <div class="templates__body">
          <aside class="templates__sidebar">
            <div class="templates__list"></div>
            <button type="button" class="btn btn--secondary templates__add" data-act="add">＋ 新建模板</button>
          </aside>
          <section class="templates__editor">
            <div class="templates__form">
              <label>图标 <input type="text" id="tpl-icon" maxlength="2" /></label>
              <label>名称 <input type="text" id="tpl-name" maxlength="50" /></label>
              <label>内容 <textarea id="tpl-content" rows="14"></textarea></label>
            </div>
            <footer class="templates__footer">
              <button type="button" class="btn btn--danger" data-act="delete">删除</button>
              <div>
                <button type="button" class="btn btn--secondary" data-act="save-tpl">保存</button>
                <button type="button" class="btn btn--primary" data-act="apply">应用</button>
              </div>
            </footer>
          </section>
        </div>
      </div>`
    document.body.appendChild(overlay)

    overlay.addEventListener('click', async (evt) => {
      const t = evt.target as HTMLElement
      const act = t.dataset.act
      if (act === 'close' || evt.target === overlay) close()
      if (act === 'add') addNew()
      if (act === 'save-tpl') await saveCurrent()
      if (act === 'delete') await deleteCurrent()
      if (act === 'apply') applyCurrent()
      const id = t.closest<HTMLElement>('[data-tpl-id]')?.dataset.tplId
      if (id) select(id)
    })
  }

  function renderList(): void {
    if (!overlay) return
    const list = overlay.querySelector<HTMLElement>('.templates__list')
    if (!list) return
    if (templates.length === 0) {
      list.innerHTML = '<p class="empty-tip">暂无模板，点击下方按钮创建</p>'
      return
    }
    list.innerHTML = templates
      .map(
        (t) => `
        <div class="templates__item ${t.id === selectedId ? 'templates__item--active' : ''}" data-tpl-id="${t.id}">
          <span class="templates__icon">${escape(t.icon || '📄')}</span>
          <span class="templates__name">${escape(t.name)}</span>
        </div>`,
      )
      .join('')
  }

  function select(id: string): void {
    selectedId = id
    const tpl = templates.find((t) => t.id === id)
    if (!tpl || !overlay) return
    ;(overlay.querySelector('#tpl-icon') as HTMLInputElement).value = tpl.icon
    ;(overlay.querySelector('#tpl-name') as HTMLInputElement).value = tpl.name
    ;(overlay.querySelector('#tpl-content') as HTMLTextAreaElement).value = tpl.content
    renderList()
  }

  function addNew(): void {
    const tpl: Template = {
      id: makeId(),
      icon: '📄',
      name: '新模板',
      content: '',
      createdAt: Date.now(),
    }
    templates.push(tpl)
    select(tpl.id)
  }

  async function saveCurrent(): Promise<void> {
    if (!overlay || !selectedId) return
    const tpl = templates.find((t) => t.id === selectedId)
    if (!tpl) return
    tpl.icon = (overlay.querySelector('#tpl-icon') as HTMLInputElement).value || '📄'
    tpl.name = (overlay.querySelector('#tpl-name') as HTMLInputElement).value || '未命名'
    tpl.content = (overlay.querySelector('#tpl-content') as HTMLTextAreaElement).value
    await save()
    renderList()
  }

  async function deleteCurrent(): Promise<void> {
    if (!selectedId) return
    const tpl = templates.find((t) => t.id === selectedId)
    if (!tpl) return
    if (!(await showConfirm({ message: `删除模板「${tpl.name}」？`, danger: true, okText: '删除' }))) return
    templates = templates.filter((t) => t.id !== selectedId)
    selectedId = null
    await save()
    renderList()
    // clear form
    ;(overlay?.querySelector('#tpl-icon') as HTMLInputElement).value = ''
    ;(overlay?.querySelector('#tpl-name') as HTMLInputElement).value = ''
    ;(overlay?.querySelector('#tpl-content') as HTMLTextAreaElement).value = ''
  }

  function applyCurrent(): void {
    if (!selectedId) return
    const tpl = templates.find((t) => t.id === selectedId)
    if (!tpl) return
    close()
    applyListeners.forEach((fn) => fn(tpl.content, tpl.name))
  }

  function close(): void {
    overlay?.classList.remove('open')
    if (escHandler) {
      document.removeEventListener('keydown', escHandler)
      escHandler = null
    }
  }

  return {
    async open() {
      if (!overlay) build()
      await load()
      selectedId = templates[0]?.id ?? null
      if (selectedId) select(selectedId)
      else renderList()
      overlay!.classList.add('open')
      escHandler = (evt) => {
        if (evt.key === 'Escape') close()
      }
      document.addEventListener('keydown', escHandler)
    },
    close,
    onApply(cb) {
      applyListeners.add(cb)
    },
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
}
