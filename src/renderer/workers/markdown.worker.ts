/// <reference lib="webworker" />
import { marked } from 'marked'
import hljs from 'highlight.js'
import { slugify } from '../lib/slugify'

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
        return `<pre class="code-pre"><code class="language-mermaid">${escape(text)}</code></pre>`
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
          return `<pre class="code-pre"><code class="hljs language-${lang}">${highlighted}</code></pre>`
        } catch {
          /* fall through */
        }
      }
      return `<pre class="code-pre"><code class="hljs">${escape(text)}</code></pre>`
    },
    heading({ tokens, depth, text }) {
      // Render inline content normally, but attach a slug id so TOC links and
      // in-page anchor jumps resolve. slugify is shared with the TOC inserter
      // (format-insert.ts) so generated anchors always match the links.
      const inner = this.parser.parseInline(tokens)
      const id = slugify(text)
      return `<h${depth}${id ? ` id="${id}"` : ''}>${inner}</h${depth}>\n`
    },
    checkbox({ checked }) {
      // Task-list checkbox: no `disabled`, explicit class so the preview's
      // delegated click handler can toggle the source `- [ ]`/`- [x]`.
      return `<input type="checkbox" class="task-list-checkbox"${checked ? ' checked=""' : ''}>\n`
    },
  },
})

// [[wiki link]] / [[target|alias]] → clickable link resolved against the
// open workspace (see preview/render.ts click handler → workspaceResolveWiki).
marked.use({
  extensions: [
    {
      name: 'wikiLink',
      level: 'inline',
      start(src: string): number {
        return src.indexOf('[[')
      },
      tokenizer(src: string) {
        const m = src.match(/^\[\[([^\]\n]+?)\]\]/)
        if (!m) return undefined
        const [target, alias] = m[1].split('|')
        const t = (target ?? '').trim()
        if (!t) return undefined
        return {
          type: 'wikiLink',
          raw: m[0],
          target: t,
          text: (alias ?? '').trim() || t,
        }
      },
      renderer(token): string {
        const t = token as unknown as { target: string; text: string }
        return `<a class="wiki-link" data-wiki="${escape(t.target)}" href="#" title="在工作区打开: ${escape(t.target)}">${escape(t.text)}</a>`
      },
    },
  ],
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
