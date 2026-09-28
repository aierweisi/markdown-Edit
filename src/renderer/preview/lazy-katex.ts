// Lazy-load KaTeX only on first $…$ or $$…$$ detection. Both the JS and the
// CSS (katex.min.css) are imported dynamically on first use, so neither is
// paid for until a document actually contains math.

type KatexApi = typeof import('katex').default

let cached: Promise<KatexApi> | null = null

export function loadKatex(): Promise<KatexApi> {
  if (!cached) {
    cached = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default)
  }
  return cached
}

// NOTE: intentionally no `g` flag. These are used only with .test() in hasMath();
// a global flag would advance lastIndex across calls and silently miss matches.
// Global matching in walkAndReplace uses `combined` (a fresh RegExp) instead.
// Inline math must not have whitespace touching either delimiter — this is
// what keeps prose like "$5 … $10" (currency amounts) from rendering as math.
const INLINE_RE = /\$(\S(?:[^\n$]*\S)?)\$/
const BLOCK_RE = /\$\$([\s\S]+?)\$\$/

// Rendered-HTML cache, keyed by (mode, tex). The preview re-renders on every
// debounced pass while typing, and morphdom can't align a previously rendered
// span.math-inline with the incoming raw "$…$" text node — every formula would
// be destroyed and re-parsed on each pass. With the cache the repeat cost is
// an innerHTML assignment instead of a full KaTeX render.
const htmlCache = new Map<string, string>()
const HTML_CACHE_MAX = 500

function cacheTrim(): void {
  // FIFO trim; document formula counts rarely approach the cap.
  const oldest = htmlCache.keys().next().value
  if (oldest !== undefined) htmlCache.delete(oldest)
}

function hasMath(text: string): boolean {
  return INLINE_RE.test(text) || BLOCK_RE.test(text)
}

export async function renderMathIn(host: HTMLElement, isStale: () => boolean = () => false): Promise<void> {
  // Walk text nodes and replace inline math; CodeMirror code blocks are
  // already protected by being inside <code>. We process only non-code spans.
  if (!host.textContent || !hasMath(host.textContent)) return
  const katex = await loadKatex()
  if (isStale()) return
  walkAndReplace(host, katex)
}

function walkAndReplace(node: Node, katex: KatexApi): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!hasMath(text)) return
    const parent = node.parentNode
    if (!parent) return
    // Skip code AND rendered SVG internals (mermaid labels may contain $…$).
    if ((parent as HTMLElement).closest?.('code, pre, svg')) return

    const fragment = document.createDocumentFragment()
    let cursor = 0
    const combined = new RegExp(`${BLOCK_RE.source}|${INLINE_RE.source}`, 'g')
    let match: RegExpExecArray | null
    while ((match = combined.exec(text))) {
      if (match.index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)))
      const isBlock = match[0].startsWith('$$')
      const tex = isBlock ? match[1] : match[2]
      const span = document.createElement(isBlock ? 'div' : 'span')
      span.className = isBlock ? 'math-block' : 'math-inline'
      const key = `${isBlock ? 'B' : 'I'}|${tex}`
      const hit = htmlCache.get(key)
      if (hit !== undefined) {
        span.innerHTML = hit
      } else {
        try {
          katex.render(tex, span, { displayMode: isBlock, throwOnError: false })
        } catch {
          span.textContent = match[0]
        }
        if (htmlCache.size >= HTML_CACHE_MAX) cacheTrim()
        htmlCache.set(key, span.innerHTML)
      }
      fragment.appendChild(span)
      cursor = match.index + match[0].length
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)))
    parent.replaceChild(fragment, node)
    return
  }
  Array.from(node.childNodes).forEach((child) => walkAndReplace(child, katex))
}
