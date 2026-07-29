/**
 * One-time delegated click handler for `[[wiki]]` links rendered by the worker.
 * Clicking resolves the target against the open workspace (via onWikiClick →
 * workspaceResolveWiki) instead of navigating the `href="#"`.
 */
export function initWikiLinks(host: HTMLElement, onWikiClick: (name: string) => void): void {
  if (host.dataset.wikiReady === '1') return
  host.dataset.wikiReady = '1'

  host.addEventListener('click', (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('.wiki-link')
    if (!link) return
    e.preventDefault()
    const name = link.dataset.wiki
    if (name) onWikiClick(name)
  })
}
