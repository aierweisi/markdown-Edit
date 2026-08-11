type MermaidApi = typeof import('mermaid').default

let cached: Promise<MermaidApi> | null = null

export function loadMermaid(): Promise<MermaidApi> {
  if (!cached) {
    cached = import('mermaid').then((m) => {
      // 'strict' (mermaid 11 default) strips unsafe HTML from diagram text.
      // We render the resulting SVG via innerHTML AFTER DOMPurify has already
      // run on the markdown body, so 'loose' would let diagram-embedded
      // <script>/event handlers bypass sanitization. CSP still backstops this,
      // but defense-in-depth: don't emit untrusted HTML in the first place.
      m.default.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' })
      return m.default
    })
  }
  return cached
}

export function refreshMermaidTheme(theme: 'light' | 'dark'): void {
  if (!cached) return
  void cached.then((m) =>
    m.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
    }),
  )
}

export async function renderMermaidIn(host: HTMLElement, isStale: () => boolean = () => false): Promise<void> {
  const blocks = host.querySelectorAll<HTMLElement>('pre code.language-mermaid')
  if (blocks.length === 0) return
  const mermaid = await loadMermaid()
  for (const code of Array.from(blocks)) {
    if (isStale()) return
    const pre = code.parentElement
    // The block's <pre> may have been removed (document switched + body cleared)
    // by the time mermaid finished loading/rendering — skip it rather than
    // reinserting the old document's diagram into the new one.
    if (!pre || !pre.isConnected || pre.dataset.mermaidRendered === '1') continue
    pre.dataset.mermaidRendered = '1'
    const id = `mmd-${Math.random().toString(36).slice(2)}`
    try {
      const { svg } = await mermaid.render(id, code.textContent ?? '')
      if (isStale() || !pre.isConnected) continue
      const wrap = document.createElement('div')
      wrap.className = 'mermaid-block'
      wrap.innerHTML = svg
      pre.replaceWith(wrap)
    } catch (err) {
      if (!pre.isConnected) continue
      const wrap = document.createElement('pre')
      wrap.className = 'mermaid-error'
      wrap.textContent = `Mermaid 渲染失败：${err instanceof Error ? err.message : String(err)}`
      pre.replaceWith(wrap)
    }
  }
}
