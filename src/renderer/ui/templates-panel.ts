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

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
}

/** Drives v1 template modal (#tpl-overlay) already present in index.html. */
export function createTemplatesPanel(ctx: AppContext): TemplatesPanelApi {
  let escHandler: ((evt: KeyboardEvent) => void) | null = null
  let templates: Template[] = []
  let selectedId: string | null = null
  const applyListeners = new Set<(content: string, name: string) => void>()
  let bound = false

  function $(id: string): HTMLElement | null {
    return document.getElementById(id)
  }

  async function load(): Promise<void> {
    templates = (await ctx.api.storeGet('templates')) ?? []
  }

  async function persist(): Promise<void> {
    await ctx.api.storeSet('templates', templates)
  }

  function renderList(): void {
    const list = $('tpl-list')
    if (!list) return
    if (templates.length === 0) {
      list.innerHTML =
        '<div class="tpl-empty-tip">暂无模板<br><span style="opacity:0.6">点击下方按钮创建</span></div>'
      return
    }
    list.innerHTML = templates
      .map(
        (t) => `
        <div class="tpl-item${t.id === selectedId ? ' active' : ''}" data-tpl-id="${t.id}">
          <span class="tpl-item-icon">${escape(t.icon || '📄')}</span>
          <span class="tpl-item-name">${escape(t.name)}</span>
        </div>`,
      )
      .join('')
  }

  function select(id: string): void {
    selectedId = id
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    setVal('tpl-icon', tpl.icon)
    setVal('tpl-name', tpl.name)
    setVal('tpl-content', tpl.content)
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
    if (!selectedId) return
    const tpl = templates.find((t) => t.id === selectedId)
    if (!tpl) return
    tpl.icon = getVal('tpl-icon') || '📄'
    tpl.name = getVal('tpl-name') || '未命名'
    tpl.content = getVal('tpl-content')
    await persist()
    renderList()
  }

  async function deleteCurrent(): Promise<void> {
    if (!selectedId) return
    const tpl = templates.find((t) => t.id === selectedId)
    if (!tpl) return
    const ok = await showConfirm({
      title: '删除模板',
      message: `删除模板「${tpl.name}」？`,
      okText: '删除',
      danger: true,
    })
    if (!ok) return
    templates = templates.filter((t) => t.id !== selectedId)
    selectedId = null
    await persist()
    renderList()
    setVal('tpl-icon', '')
    setVal('tpl-name', '')
    setVal('tpl-content', '')
  }

  function applyCurrent(): void {
    if (!selectedId) return
    const tpl = templates.find((t) => t.id === selectedId)
    if (!tpl) return
    close()
    applyListeners.forEach((fn) => fn(tpl.content, tpl.name))
  }

  function close(): void {
    const overlay = $('tpl-overlay')
    if (!overlay) return
    overlay.classList.remove('open')
    overlay.classList.add('closing')
    setTimeout(() => overlay.classList.remove('closing'), 200)
    if (escHandler) {
      document.removeEventListener('keydown', escHandler)
      escHandler = null
    }
  }

  function bind(): void {
    if (bound) return
    bound = true
    const overlay = $('tpl-overlay')
    if (!overlay) return

    $('tpl-close')?.addEventListener('click', close)
    $('tpl-btn-add')?.addEventListener('click', addNew)
    $('tpl-btn-save')?.addEventListener('click', () => void saveCurrent())
    $('tpl-btn-delete')?.addEventListener('click', () => void deleteCurrent())
    $('tpl-btn-apply')?.addEventListener('click', applyCurrent)

    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) close()
      const id = (evt.target as HTMLElement).closest<HTMLElement>('[data-tpl-id]')?.dataset.tplId
      if (id) select(id)
    })
  }

  return {
    async open() {
      bind()
      await load()
      selectedId = templates[0]?.id ?? null
      if (selectedId) select(selectedId)
      else {
        renderList()
        setVal('tpl-icon', '')
        setVal('tpl-name', '')
        setVal('tpl-content', '')
      }
      $('tpl-overlay')?.classList.add('open')
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

function getVal(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
  return el?.value ?? ''
}

function setVal(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
  if (el) el.value = value
}
