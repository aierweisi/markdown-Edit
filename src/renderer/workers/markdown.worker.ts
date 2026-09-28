/// <reference lib="webworker" />
import { marked } from 'marked'
// highlight.js core + a curated language set instead of the full ~190-language
// bundle: smaller worker payload, faster startup, less memory. Aliases (js →
// javascript, sh → bash, …) are resolved by hljs.getLanguage from these.
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import lua from 'highlight.js/lib/languages/lua'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { slugify } from '../lib/slugify'

const HLJS_LANGUAGES = [
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  lua,
  markdown,
  php,
  plaintext,
  powershell,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
]
for (const lang of HLJS_LANGUAGES) hljs.registerLanguage(lang.name, lang)

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
// Plus ==highlight== → <mark> (DOMPurify allows <mark> by default).
marked.use({
  extensions: [
    {
      name: 'highlight',
      level: 'inline',
      start(src: string): number {
        return src.indexOf('==')
      },
      tokenizer(src: string) {
        // Non-space content only, so "a == b == c" prose stays untouched.
        const m = src.match(/^==(?=\S)([\s\S]*?\S)==/)
        if (!m) return undefined
        return {
          type: 'highlight',
          raw: m[0],
          tokens: this.lexer.inlineTokens(m[1]),
        }
      },
      renderer(token): string {
        return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`
      },
    },
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

// ── YAML front matter ───────────────────────────────────────────────────
// Rendered as a key/value info box ABOVE the body instead of letting marked
// see it (where `---` would become a thematic break / setext heading). The
// block is stripped from the parsed text, so heading/task line pairing with
// the source (which still counts the front matter lines) is unaffected —
// front matter contributes no headings either way.
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function renderFrontMatter(fm: string): string {
  const rows: string[] = []
  for (const line of fm.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (kv) {
      rows.push(
        `<div class="fm-row"><span class="fm-key">${escape(kv[1]!)}</span><span class="fm-val">${escape(
          kv[2] ?? '',
        )}</span></div>`,
      )
    }
  }
  return rows.length > 0 ? `<div class="front-matter">${rows.join('')}</div>` : ''
}

self.onmessage = async (evt: MessageEvent<RenderRequest>): Promise<void> => {
  const { id, text } = evt.data
  try {
    const fm = text.match(FRONT_MATTER_RE)
    const body = fm ? text.slice(fm[0].length) : text
    const html = await marked.parse(body)
    const full = (fm ? renderFrontMatter(fm[1]!) : '') + (typeof html === 'string' ? html : String(html))
    const response: RenderResponse = { id, html: full }
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
