import type { AppContext } from '../context'
import type { TabManager } from './tab-manager'

const TAB_CLASS = 'tab-bar__item'
const ACTIVE_CLASS = 'tab-bar__item--active'

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

  function render(): void {
    const tabs = opts.tabs.getAll()
    const activeId = opts.ctx.store.activeTabId()
    container!.innerHTML = ''
    for (const tab of tabs) {
      const el = document.createElement('div')
      el.className = TAB_CLASS + (tab.id === activeId ? ' ' + ACTIVE_CLASS : '')
      el.dataset.tabId = tab.id

      const label = document.createElement('span')
      label.className = 'tab-bar__label'
      label.textContent = (tab.modified ? '● ' : '') + tab.title
      el.appendChild(label)

      const closeBtn = document.createElement('button')
      closeBtn.type = 'button'
      closeBtn.className = 'tab-bar__close'
      closeBtn.textContent = '✕'
      closeBtn.dataset.action = 'close'
      el.appendChild(closeBtn)

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
    if (target.dataset.action === 'close') {
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
