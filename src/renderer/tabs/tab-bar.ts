import type { AppContext } from '../context'
import type { TabManager } from './tab-manager'

interface TabBarOpts {
  ctx: AppContext
  tabs: TabManager
  onActivate(id: string): void
  onClose(id: string): void
}

export function mountTabBar(opts: TabBarOpts): () => void {
  const container = opts.ctx.dom.tabsContainer
  if (!container) {
    console.warn('[tab-bar] tabs-container element not found')
    return () => undefined
  }

  function escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
    })
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

      const title = document.createElement('span')
      title.className = 'tab-title'
      title.textContent = tab.title
      el.appendChild(title)

      const dot = document.createElement('span')
      dot.className = 'tab-dot'
      el.appendChild(dot)

      const closeBtn = document.createElement('button')
      closeBtn.type = 'button'
      closeBtn.className = 'tab-close'
      closeBtn.innerHTML = '✕'
      closeBtn.dataset.action = 'tab-close'
      el.appendChild(closeBtn)

      el.title = tab.title
      el.dataset.titleEsc = escape(tab.title)
      container!.appendChild(el)
    }
  }

  function onClick(evt: MouseEvent): void {
    const target = evt.target
    if (!(target instanceof HTMLElement)) return
    const tabEl = target.closest<HTMLElement>('[data-tab-id]')
    if (!tabEl) return
    const id = tabEl.dataset.tabId
    if (!id) return
    if (target.dataset.action === 'tab-close' || target.classList.contains('tab-close')) {
      opts.onClose(id)
      return
    }
    opts.onActivate(id)
  }

  container.addEventListener('click', onClick)

  const unsubs = [
    opts.ctx.store.tabs.subscribe(render),
    opts.ctx.store.activeTabId.subscribe(render),
  ]
  render()

  return () => {
    container!.removeEventListener('click', onClick)
    unsubs.forEach((u) => u())
  }
}
