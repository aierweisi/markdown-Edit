import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'

interface WelcomeDeps {
  ctx: AppContext
  tabs: TabManager
  onNew(): void
  onOpen(): void
  onTemplate(): void
}

export function attachWelcome(deps: WelcomeDeps): () => void {
  const overlay = deps.ctx.dom.welcomeOverlay
  if (!overlay) return () => undefined

  let dismissed = false

  function update(): void {
    if (dismissed) {
      overlay!.classList.add('hidden')
      return
    }
    const all = deps.tabs.getAll()
    const active = deps.tabs.getActive()
    const showWelcome =
      all.length === 0 ||
      (all.length === 1 &&
        !active?.filePath &&
        !active?.modified &&
        deps.tabs.getContent(active?.id ?? '').trim().length === 0)
    overlay!.classList.toggle('hidden', !showWelcome)
  }

  function onClick(evt: MouseEvent): void {
    const t = evt.target as HTMLElement
    // v1 uses #welcome-new / #welcome-open / #welcome-template button IDs
    const action =
      t.dataset.welcomeAction ??
      ({
        'welcome-new': 'new',
        'welcome-open': 'open',
        'welcome-template': 'template',
      }[t.id] ??
        ({
          'welcome-new': 'new',
          'welcome-open': 'open',
          'welcome-template': 'template',
        }[t.closest<HTMLElement>('button')?.id ?? ''] ?? ''))
    if (action === 'new') {
      dismissed = true
      deps.onNew()
    } else if (action === 'open') {
      dismissed = true
      deps.onOpen()
    } else if (action === 'template') {
      dismissed = true
      deps.onTemplate()
    }
    update()
  }

  overlay.addEventListener('click', onClick)
  const unsubs = [
    deps.ctx.store.tabs.subscribe(update),
    deps.ctx.store.activeTabId.subscribe(update),
  ]
  update()

  return () => {
    overlay.removeEventListener('click', onClick)
    unsubs.forEach((u) => u())
  }
}
