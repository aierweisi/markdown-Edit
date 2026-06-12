import type { AppContext } from '../context'
import type { TabManager } from './tab-manager'
import { showTabContextMenu } from './tab-context-menu'

interface TabBarOpts {
  ctx: AppContext
  tabs: TabManager
  onActivate(id: string): void
  onClose(id: string): void
  onCloseOthers?(id: string): void
  onCloseRight?(id: string): void
  onRename?(id: string): void
}

const DATA_MIME = 'text/tab-id'

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
}

export function mountTabBar(opts: TabBarOpts): () => void {
  const container = opts.ctx.dom.tabsContainer
  if (!container) {
    console.warn('[tab-bar] tabs-container element not found')
    return () => undefined
  }

  function render(): void {
    const tabs = opts.tabs.getAll()
    const activeId = opts.ctx.store.activeTabId()
    container!.innerHTML = ''
    for (const tab of tabs) {
      const el = document.createElement('div')
      el.className =
        'tab' + (tab.id === activeId ? ' active' : '') + (tab.modified ? ' modified' : '')
      el.dataset.tabId = tab.id
      el.dataset.id = tab.id // mirror v1 attribute name in case CSS depends on it
      el.draggable = true
      el.title = tab.title
      el.innerHTML =
        `<span class="tab-title">${escape(tab.title)}</span>` +
        `<span class="tab-dot"></span>` +
        `<button type="button" class="tab-close" data-action="tab-close">✕</button>`
      container!.appendChild(el)
    }
  }

  function findTabEl(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null
    return target.closest<HTMLElement>('[data-tab-id]')
  }

  function onClick(evt: MouseEvent): void {
    const target = evt.target
    if (!(target instanceof HTMLElement)) return
    const tabEl = findTabEl(target)
    if (!tabEl) return
    const id = tabEl.dataset.tabId
    if (!id) return
    if (target.dataset.action === 'tab-close' || target.classList.contains('tab-close')) {
      opts.onClose(id)
      return
    }
    opts.onActivate(id)
  }

  function onMiddleClick(evt: MouseEvent): void {
    if (evt.button !== 1) return
    const tabEl = findTabEl(evt.target)
    if (!tabEl) return
    evt.preventDefault()
    const id = tabEl.dataset.tabId
    if (id) opts.onClose(id)
  }

  function onContext(evt: MouseEvent): void {
    const tabEl = findTabEl(evt.target)
    if (!tabEl) return
    evt.preventDefault()
    const id = tabEl.dataset.tabId
    if (!id) return
    showTabContextMenu({
      x: evt.clientX,
      y: evt.clientY,
      tabId: id,
      ctx: opts.ctx,
      tabs: opts.tabs,
      onActivate: opts.onActivate,
      onClose: opts.onClose,
      onCloseOthers: opts.onCloseOthers,
      onCloseRight: opts.onCloseRight,
      onRename: opts.onRename,
    })
  }

  // ── Drag-and-drop reorder ───────────────────────────────────────────
  function onDragStart(evt: DragEvent): void {
    const tabEl = findTabEl(evt.target)
    if (!tabEl || !evt.dataTransfer) return
    evt.dataTransfer.effectAllowed = 'move'
    evt.dataTransfer.setData(DATA_MIME, tabEl.dataset.tabId ?? '')
    tabEl.classList.add('dragging')
  }

  function onDragEnd(evt: DragEvent): void {
    const tabEl = findTabEl(evt.target)
    tabEl?.classList.remove('dragging')
    container!.querySelectorAll('.tab.drag-over').forEach((e) => e.classList.remove('drag-over'))
  }

  function onDragOver(evt: DragEvent): void {
    const tabEl = findTabEl(evt.target)
    if (!tabEl || !evt.dataTransfer) return
    evt.preventDefault()
    evt.dataTransfer.dropEffect = 'move'
    container!.querySelectorAll('.tab.drag-over').forEach((e) => e.classList.remove('drag-over'))
    const dragging = container!.querySelector<HTMLElement>('.tab.dragging')
    if (dragging && dragging.dataset.tabId !== tabEl.dataset.tabId) {
      tabEl.classList.add('drag-over')
    }
  }

  function onDragLeave(evt: DragEvent): void {
    findTabEl(evt.target)?.classList.remove('drag-over')
  }

  function onDrop(evt: DragEvent): void {
    const tabEl = findTabEl(evt.target)
    if (!tabEl || !evt.dataTransfer) return
    evt.preventDefault()
    tabEl.classList.remove('drag-over')
    const draggedId = evt.dataTransfer.getData(DATA_MIME)
    const targetId = tabEl.dataset.tabId
    if (draggedId && targetId && draggedId !== targetId) {
      opts.tabs.reorder(draggedId, targetId)
    }
  }

  container.addEventListener('click', onClick)
  container.addEventListener('auxclick', onMiddleClick)
  container.addEventListener('mousedown', (evt) => {
    if (evt.button === 1) evt.preventDefault()
  })
  container.addEventListener('contextmenu', onContext)
  container.addEventListener('dragstart', onDragStart)
  container.addEventListener('dragend', onDragEnd)
  container.addEventListener('dragover', onDragOver)
  container.addEventListener('dragleave', onDragLeave)
  container.addEventListener('drop', onDrop)

  const unsubs = [
    opts.ctx.store.tabs.subscribe(render),
    opts.ctx.store.activeTabId.subscribe(render),
  ]
  render()

  return () => {
    container!.removeEventListener('click', onClick)
    container!.removeEventListener('auxclick', onMiddleClick)
    container!.removeEventListener('contextmenu', onContext)
    container!.removeEventListener('dragstart', onDragStart)
    container!.removeEventListener('dragend', onDragEnd)
    container!.removeEventListener('dragover', onDragOver)
    container!.removeEventListener('dragleave', onDragLeave)
    container!.removeEventListener('drop', onDrop)
    unsubs.forEach((u) => u())
  }
}
