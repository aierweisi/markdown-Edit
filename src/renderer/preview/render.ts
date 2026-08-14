import DOMPurify from 'dompurify'
import morphdom from 'morphdom'
import { createMarkdownWorkerClient, type MarkdownWorkerClient } from './worker-client'
import { renderMermaidIn } from './lazy-mermaid'
import { renderMathIn } from './lazy-katex'
import { initCodeCopy, updateCodeCopyButtons } from './code-copy'
import { initTaskCheckbox, updateTaskCheckboxes } from './task-checkbox'
import { initWikiLinks } from './wiki-link'
import { parseHeadings } from '../lib/parse-headings'
import { ALLOWED_URI_REGEXP } from './uri-policy'

export interface PreviewApi {
  render(text: string): void
  /** Hard-reset for a document switch: cancel pending renders, clear the body,
   *  and invalidate any in-flight async work (mermaid/katex). Call before render()
   *  when swapping to a different document so morphdom diffs against an empty
   *  body instead of the previous (possibly large) file's DOM. */
  reset(): void
  /** Tell preview which file's directory to use as base URL for relative <img>/<a> hrefs. */
  setBaseFilePath(filePath: string | null): void
  destroy(): void
}

interface PreviewOpts {
  body: HTMLElement
  /** Accessor for the current editor document (task checkbox sync/toggle). */
  getDoc(): string
  /** Replace a 1-based source line (flows through the editor's normal change). */
  onReplaceLine(line: number, newLine: string): void
  /** A `[[wiki]]` link was clicked — resolve & open in workspace. */
  onWikiClick(name: string): void
  /** A heading was clicked in the preview — jump editor to its source line. */
  onHeadingClick(line: number): void
}

const HAS_PROTOCOL = /^[a-z][a-z0-9+\-.]*:/i

function toFileBaseUrl(filePath: string): string {
  // Strip filename — keep the directory plus trailing slash, then file:// it.
  const dir = filePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
  // Ensure leading slash so URL constructor treats it as absolute.
  const normalized = dir.startsWith('/') ? dir : '/' + dir
  return 'file://' + normalized + '/'
}

export function createPreview(opts: PreviewOpts): PreviewApi {
  const worker: MarkdownWorkerClient = createMarkdownWorkerClient()
  let pendingText: string | null = null
  let renderingFor: string | null = null
  let idleHandle: number | null = null
  let scheduledWithRaf = false
  let debounceHandle: ReturnType<typeof setTimeout> | null = null
  let baseFilePath: string | null = null
  // Bumped on reset(); each render captures the value and bails if it changed,
  // so a slow render for a document we've already switched away from can never
  // write into (or reuse nodes of) the new document.
  let docGen = 0

  // Coalesce rapid edits (fast typing) into one render. Without it, every
  // keystroke schedules an idle render — for large docs that means a full
  // marked.parse + DOMPurify + morphdom pass back-to-back. The debounce lets
  // pendingText absorb intermediate edits so only the latest is rendered, while
  // requestIdleCallback still defers the actual work to an idle frame.
  const RENDER_DEBOUNCE_MS = 80

  function cancelIdle(): void {
    if (debounceHandle != null) {
      clearTimeout(debounceHandle)
      debounceHandle = null
    }
    if (idleHandle == null) return
    if (scheduledWithRaf) cancelAnimationFrame(idleHandle)
    else if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle)
    idleHandle = null
  }

  // One-time init: set up delegated copy button + task checkbox handlers
  initCodeCopy(opts.body)
  initTaskCheckbox(opts.body, { getDoc: opts.getDoc, onReplaceLine: opts.onReplaceLine })
  initWikiLinks(opts.body, opts.onWikiClick)
  // Click a rendered heading to jump the editor to its source line.
  opts.body.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.closest('a')) return // let links inside headings navigate normally
    const h = target.closest<HTMLElement>('h1, h2, h3, h4, h5, h6')
    const line = parseInt(h?.dataset.line ?? '', 10)
    if (h && line > 0) opts.onHeadingClick(line)
  })

  function flush(): void {
    idleHandle = null
    if (pendingText === null) return
    const text = pendingText
    pendingText = null
    renderingFor = text
    const gen = docGen
    const isStale = (): boolean => gen !== docGen
    void worker
      .render(text)
      .then((html) => {
        if (renderingFor !== text || isStale()) return
        applyHtml(html)
        tagHeadingLines(opts.body, text)
        rewriteRelativeAssets(opts.body, baseFilePath)
        void renderMermaidIn(opts.body, isStale)
        void renderMathIn(opts.body, isStale)
        updateCodeCopyButtons(opts.body)
        updateTaskCheckboxes(opts.body, opts.getDoc)
      })
      .catch((err) => {
        console.error('[preview] render failed:', err)
      })
  }

  function scheduleRender(text: string): void {
    pendingText = text
    // A render is already queued in the idle phase (or in flight): it will pick
    // up the latest pendingText when it runs, so just update the buffer and bail.
    if (idleHandle != null) return
    if (debounceHandle != null) clearTimeout(debounceHandle)
    debounceHandle = setTimeout(() => {
      debounceHandle = null
      if (pendingText === null || idleHandle != null) return
      if (typeof requestIdleCallback === 'function') {
        idleHandle = requestIdleCallback(flush, { timeout: 200 }) as unknown as number
        scheduledWithRaf = false
      } else {
        idleHandle = window.requestAnimationFrame(flush)
        scheduledWithRaf = true
      }
    }, RENDER_DEBOUNCE_MS)
  }

  function applyHtml(rawHtml: string): void {
    const clean = DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'rel', 'data-wiki'],
      // Allow file:// URIs and relative asset paths (default DOMPurify whitelist
      // only allows http/https/mailto/…). See uri-policy.ts for the full rationale.
      ALLOWED_URI_REGEXP,
    })
    const tmp = document.createElement('article')
    tmp.className = opts.body.className
    tmp.innerHTML = clean
    morphdom(opts.body, tmp, {
      childrenOnly: true,
      onBeforeElUpdated(fromEl, toEl) {
        // Preserve already-rendered mermaid blocks
        if (
          (fromEl as HTMLElement).classList?.contains('mermaid-block') &&
          fromEl.isEqualNode(toEl as Node) === false
        ) {
          return false
        }
        return true
      },
    })
  }

  function reset(): void {
    cancelIdle()
    pendingText = null
    renderingFor = null
    docGen++
    // Hard-clear so the next render starts from an empty body instead of
    // morphdom-diffing against the previous (possibly large) document, which
    // could reuse/retain stale nodes (e.g. already-rendered mermaid blocks) and
    // leave the top showing the old file's content after a switch.
    opts.body.innerHTML = ''
  }

  return {
    render(text) {
      scheduleRender(text)
    },
    reset,
    setBaseFilePath(filePath) {
      baseFilePath = filePath
    },
    destroy() {
      worker.destroy()
      cancelIdle()
    },
  }
}

/**
 * Resolve any <img src> / <a href> in `host` that lacks a protocol into a
 * `file://` absolute URL relative to the active document's directory. Without
 * this rewrite the renderer's file:// base would resolve relative paths
 * against `out/renderer/` rather than the actual document folder.
 */
/** Stamp each rendered heading with its 1-based source line (data-line) by pairing
 *  the preview's h1-h6 in document order with parsed source headings. Only stamp
 *  when the parser and renderer agree on the heading count — otherwise (Setext,
 *  blockquote headings, etc.) skip rather than risk jumping to the wrong line. */
function tagHeadingLines(host: HTMLElement, text: string): void {
  const headings = parseHeadings(text)
  const els = host.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  if (els.length !== headings.length) {
    els.forEach((el) => delete el.dataset.line)
    return
  }
  els.forEach((el, i) => {
    el.dataset.line = String(headings[i].line)
  })
}

function rewriteRelativeAssets(host: HTMLElement, baseFilePath: string | null): void {
  if (!baseFilePath) return
  const baseUrl = toFileBaseUrl(baseFilePath)

  host.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (!src || HAS_PROTOCOL.test(src) || src.startsWith('data:') || src.startsWith('blob:')) return
    try {
      img.src = new URL(src, baseUrl).href
    } catch {
      /* leave untouched */
    }
  })

  host.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href')
    if (!href || HAS_PROTOCOL.test(href) || href.startsWith('#') || href.startsWith('mailto:'))
      return
    try {
      a.href = new URL(href, baseUrl).href
    } catch {
      /* leave untouched */
    }
  })
}
