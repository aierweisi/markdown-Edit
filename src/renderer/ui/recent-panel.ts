import type { RecentManager } from '../recent/recent-files'

export interface RecentPanelApi {
  open(): void
  close(): void
}

interface RecentDeps {
  recent: RecentManager
  onSelect(path: string): void
}

export function createRecentPanel(deps: RecentDeps): RecentPanelApi {
  let overlay: HTMLElement | null = null
  let escHandler: ((evt: KeyboardEvent) => void) | null = null

  function build(): HTMLElement {
    overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal modal--small">
        <header class="modal__header">
          <h2>最近文件</h2>
          <button type="button" class="modal__close" data-act="close">✕</button>
        </header>
        <div class="modal__body recent-panel__body"></div>
      </div>`
    document.body.appendChild(overlay)
    overlay.addEventListener('click', (evt) => {
      const t = evt.target as HTMLElement
      if (t.dataset.act === 'close' || evt.target === overlay) close()
      const path = t.closest<HTMLElement>('[data-recent-path]')?.dataset.recentPath
      if (path) {
        close()
        deps.onSelect(path)
      }
    })
    return overlay
  }

  function render(items: { path: string; name: string }[]): void {
    if (!overlay) return
    const body = overlay.querySelector<HTMLElement>('.recent-panel__body')
    if (!body) return
    if (items.length === 0) {
      body.innerHTML = '<p class="empty-tip">暂无最近文件</p>'
      return
    }
    body.innerHTML = items
      .map(
        (r) => `
        <div class="recent-item" data-recent-path="${escape(r.path)}">
          <div class="recent-item__name">${escape(r.name)}</div>
          <div class="recent-item__path">${escape(r.path)}</div>
        </div>`,
      )
      .join('')
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
      render(await deps.recent.list())
      overlay!.classList.add('open')
      escHandler = (evt) => {
        if (evt.key === 'Escape') close()
      }
      document.addEventListener('keydown', escHandler)
    },
    close,
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
}
