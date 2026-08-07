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
    const all = deps.tabs.getAll()
    // When no tabs remain, surface the welcome page again — user is back at a blank state.
    if (all.length === 0) dismissed = false
    if (dismissed) {
      overlay!.classList.add('hidden')
      return
    }
    // Show the welcome page only when there are no tabs. The previous heuristic
    // also surfaced it for a single pristine untitled tab — but the only way to
    // reach that state is an explicit "new tab" action, where the user expects
    // to see the empty editor, not the welcome page. That misfired after closing
    // all tabs then creating one (welcome stayed until a second tab was added).
    const showWelcome = all.length === 0
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
