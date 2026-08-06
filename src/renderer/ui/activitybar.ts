import type { AppContext } from '../context'
import type { WorkspacePanelApi } from './workspace-panel'
import type { OutlineApi } from './outline-panel'

export type SidebarView = 'workspace' | 'outline'

export interface ActivitybarApi {
  /** Click an activity icon: collapse if it's the active open view, else open+switch. */
  toggleView(view: SidebarView): void
  /** Open the sidebar host and switch to `view`. */
  openView(view: SidebarView): void
  /** Collapse the host (the activity bar itself stays visible). */
  close(): void
  isOpen(): boolean
  isActive(view: SidebarView): boolean
  /** Active tab changed — re-highlight the file tree, reveal the file if workspace is active. */
  onActiveTabChange(filePath: string | null): void
  /** Restore persisted state on startup (with one-time legacy migration). */
  init(): Promise<void>
}

interface ActivitybarOpts {
  ctx: AppContext
  workspace: WorkspacePanelApi
  outline: OutlineApi
  /** Current editor text, used to refresh the outline when its view opens. */
  getEditorText(): string
}

/**
 * Single source of truth for the sidebar host: which view is active and whether
 * it is open. Wraps the workspace/outline content modules — it owns visibility
 * and view-switching, they own their own content.
 */
export function createActivitybar(opts: ActivitybarOpts): ActivitybarApi {
  const { ctx, workspace, outline } = opts
  let activeView: SidebarView = 'workspace'
  let sidebarOpen = false

  const $host = (): HTMLElement | null => document.getElementById('sidebar-host')
  const abItems = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.ab-item'))

  function syncButtons(): void {
    const wsOn = activeView === 'workspace' && sidebarOpen
    const olOn = activeView === 'outline' && sidebarOpen
    abItems().forEach((b) => {
      const v = b.dataset.view
      b.classList.toggle('active', (v === 'workspace' && wsOn) || (v === 'outline' && olOn))
    })
    // Keep the format-toolbar entry buttons in sync (they route here too).
    document.getElementById('btn-workspace')?.classList.toggle('active', wsOn)
    document.getElementById('btn-outline')?.classList.toggle('active', olOn)
  }

  function applyState(): void {
    $host()?.classList.toggle('open', sidebarOpen)
    document.querySelectorAll<HTMLElement>('.sidebar-view').forEach((v) => {
      v.hidden = !sidebarOpen || v.dataset.view !== activeView
    })
    syncButtons()
  }

  async function openView(view: SidebarView): Promise<void> {
    activeView = view
    sidebarOpen = true
    applyState()
    void ctx.api.storeSet('sidebarActiveView', view)
    void ctx.api.storeSet('sidebarOpen', true)
    if (view === 'workspace') await workspace.reveal()
    else outline.refresh(opts.getEditorText())
  }

  function close(): void {
    sidebarOpen = false
    applyState()
    void ctx.api.storeSet('sidebarOpen', false)
  }

  function toggleView(view: SidebarView): void {
    if (sidebarOpen && activeView === view) {
      close()
      return
    }
    void openView(view)
  }

  function isOpen(): boolean {
    return sidebarOpen
  }
  function isActive(view: SidebarView): boolean {
    return sidebarOpen && activeView === view
  }

  async function init(): Promise<void> {
    const storedView = await ctx.api.storeGet('sidebarActiveView')
    activeView = storedView === 'outline' ? 'outline' : 'workspace'
    // sidebarOpen is backfilled by the store migration (with legacy mapping),
    // so it is always defined here.
    sidebarOpen = (await ctx.api.storeGet('sidebarOpen')) === true
    applyState()
    if (sidebarOpen && activeView === 'workspace') await workspace.reveal()
  }

  // Activity-bar icon clicks → toggle that view.
  abItems().forEach((b) => {
    const view = b.dataset.view as SidebarView | undefined
    if (view) b.addEventListener('click', () => toggleView(view))
  })
  // The workspace view's own collapse button → collapse the host.
  document.getElementById('ws-close')?.addEventListener('click', () => close())
  // The outline view's own close button likewise.
  document.querySelector('.outline-pane__close')?.addEventListener('click', () => close())

  return {
    toggleView,
    openView: (v) => void openView(v),
    close,
    isOpen,
    isActive,
    onActiveTabChange: (filePath) => {
      workspace.markActive(filePath)
      if (isActive('workspace')) void workspace.revealActiveFile()
    },
    init,
  }
}
