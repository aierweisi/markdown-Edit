type MermaidApi = typeof import('mermaid').default

let cached: Promise<MermaidApi> | null = null

export function loadMermaid(): Promise<MermaidApi> {
  if (!cached) {
    cached = import('mermaid').then((m) => {
      m.default.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })
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
      securityLevel: 'loose',
    }),
  )
}

export async function renderMermaidIn(host: HTMLElement): Promise<void> {
  const blocks = host.querySelectorAll<HTMLElement>('pre code.language-mermaid')
  if (blocks.length === 0) return
  const mermaid = await loadMermaid()
  for (const code of Array.from(blocks)) {
    const pre = code.parentElement
    if (!pre || pre.dataset.mermaidRendered === '1') continue
    const id = `mmd-${Math.random().toString(36).slice(2)}`
    try {
      const { svg } = await mermaid.render(id, code.textContent ?? '')
      const wrap = document.createElement('div')
      wrap.className = 'mermaid-block'
      wrap.innerHTML = svg
      pre.replaceWith(wrap)
    } catch (err) {
      const wrap = document.createElement('pre')
      wrap.className = 'mermaid-error'
      wrap.textContent = `Mermaid 渲染失败：${err instanceof Error ? err.message : String(err)}`
      pre.replaceWith(wrap)
    }
  }
}
