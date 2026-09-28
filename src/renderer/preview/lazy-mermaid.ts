import DOMPurify from 'dompurify'

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
  // Cached SVGs carry the theme they were rendered with — drop them so the
  // next render pass re-renders diagrams in the new theme.
  svgCache.clear()
  void cached.then((m) =>
    m.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
    }),
  )
}

// Sanitized-SVG cache keyed by diagram source. The preview re-renders on every
// debounced pass while typing, and morphdom can't align a previously rendered
// div.mermaid-block with the incoming <pre> — the diagram would be destroyed
// and re-rendered (synchronously, on the main thread) on each pass. With the
// cache the repeat cost is an innerHTML assignment; mermaid.render runs once
// per distinct diagram.
const svgCache = new Map<string, string>()
const SVG_CACHE_MAX = 100

function cacheTrim(): void {
  const oldest = svgCache.keys().next().value
  if (oldest !== undefined) svgCache.delete(oldest)
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
    const src = code.textContent ?? ''
    const wrap = document.createElement('div')
    wrap.className = 'mermaid-block'
    const cached = svgCache.get(src)
    if (cached !== undefined) {
      wrap.innerHTML = cached
      pre.replaceWith(wrap)
      continue
    }
    const id = `mmd-${Math.random().toString(36).slice(2)}`
    try {
      const { svg } = await mermaid.render(id, src)
      if (isStale() || !pre.isConnected) continue
      // Defense-in-depth: mermaid runs securityLevel:'strict', but this SVG is
      // injected via innerHTML AFTER DOMPurify's main pass on the body, so it
      // would bypass sanitization if a future mermaid/config drift emitted
      // <script>/event handlers. Sanitize with the SVG profile before injecting,
      // and cache the sanitized markup so hits never re-run mermaid.
      wrap.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      })
      if (svgCache.size >= SVG_CACHE_MAX) cacheTrim()
      svgCache.set(src, wrap.innerHTML)
      pre.replaceWith(wrap)
    } catch (err) {
      if (!pre.isConnected) continue
      const errWrap = document.createElement('pre')
      errWrap.className = 'mermaid-error'
      errWrap.textContent = `Mermaid 渲染失败：${err instanceof Error ? err.message : String(err)}`
      pre.replaceWith(errWrap)
    }
  }
}
