/// <reference lib="webworker" />
import { marked } from 'marked'
import hljs from 'highlight.js'

export interface RenderRequest {
  id: number
  text: string
}

export interface RenderResponse {
  id: number
  html: string
  error?: string
}

marked.setOptions({
  gfm: true,
  breaks: true,
})

// Register a renderer override that runs highlight.js for fenced code blocks.
// language-mermaid is left untouched so the renderer can post-process it.
marked.use({
  renderer: {
    code(token) {
      const lang = (token.lang ?? '').trim()
      const text = token.text
      if (lang === 'mermaid') {
        return `<pre><code class="language-mermaid">${escape(text)}</code></pre>`
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
          return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`
        } catch {
          /* fall through */
        }
      }
      return `<pre><code class="hljs">${escape(text)}</code></pre>`
    },
  },
})

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
}

self.onmessage = async (evt: MessageEvent<RenderRequest>): Promise<void> => {
  const { id, text } = evt.data
  try {
    const html = await marked.parse(text)
    const response: RenderResponse = { id, html: typeof html === 'string' ? html : String(html) }
    ;(self as unknown as Worker).postMessage(response)
  } catch (err) {
    const response: RenderResponse = {
      id,
      html: '',
      error: err instanceof Error ? err.message : String(err),
    }
    ;(self as unknown as Worker).postMessage(response)
  }
}
