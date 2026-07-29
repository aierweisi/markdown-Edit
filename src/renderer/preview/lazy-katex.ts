// Lazy-load KaTeX only on first $…$ or $$…$$ detection. The CSS is imported
// statically (via styles/index.css) because the font URLs need to resolve at
// page load; the JS portion is the real cost.

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
const INLINE_RE = /\$([^\n$]+?)\$/
const BLOCK_RE = /\$\$([\s\S]+?)\$\$/

function hasMath(text: string): boolean {
  return INLINE_RE.test(text) || BLOCK_RE.test(text)
}

export async function renderMathIn(host: HTMLElement): Promise<void> {
  // Walk text nodes and replace inline math; CodeMirror code blocks are
  // already protected by being inside <code>. We process only non-code spans.
  if (!host.textContent || !hasMath(host.textContent)) return
  const katex = await loadKatex()
  walkAndReplace(host, katex)
}

function walkAndReplace(node: Node, katex: KatexApi): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!hasMath(text)) return
    const parent = node.parentNode
    if (!parent) return
    if ((parent as HTMLElement).closest?.('code, pre')) return

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
      try {
        katex.render(tex, span, { displayMode: isBlock, throwOnError: false })
      } catch {
        span.textContent = match[0]
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
