import DOMPurify from 'dompurify'
import morphdom from 'morphdom'
import { createMarkdownWorkerClient, type MarkdownWorkerClient } from './worker-client'
import { renderMermaidIn } from './lazy-mermaid'
import { renderMathIn } from './lazy-katex'
import { initCodeCopy, updateCodeCopyButtons } from './code-copy'

export interface PreviewApi {
  render(text: string): void
  /** Tell preview which file's directory to use as base URL for relative <img>/<a> hrefs. */
  setBaseFilePath(filePath: string | null): void
  destroy(): void
}

interface PreviewOpts {
  body: HTMLElement
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
  let baseFilePath: string | null = null

  // One-time init: set up delegated copy button handler
  initCodeCopy(opts.body)

  function scheduleRender(text: string): void {
    pendingText = text
    if (idleHandle != null) return

    const flush = (): void => {
      idleHandle = null
      if (pendingText === null) return
      const text = pendingText
      pendingText = null
      renderingFor = text
      void worker
        .render(text)
        .then((html) => {
          if (renderingFor !== text) return
          applyHtml(html)
          rewriteRelativeAssets(opts.body, baseFilePath)
          void renderMermaidIn(opts.body)
          void renderMathIn(opts.body)
          updateCodeCopyButtons(opts.body)
        })
        .catch((err) => {
          console.error('[preview] render failed:', err)
        })
    }

    if (typeof requestIdleCallback === 'function') {
      idleHandle = requestIdleCallback(flush, { timeout: 100 }) as unknown as number
      scheduledWithRaf = false
    } else {
      idleHandle = window.requestAnimationFrame(flush)
      scheduledWithRaf = true
    }
  }

  function applyHtml(rawHtml: string): void {
    const clean = DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'rel'],
      // Allow file:// URIs (default whitelist only allows http/https/mailto/...).
      // Electron renderer can safely load local files; users routinely paste
      // images at file:///… paths and embed local relative assets.
      ALLOWED_URI_REGEXP:
        /^(?:(?:(?:f|ht)tps?|file|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
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

  return {
    render(text) {
      scheduleRender(text)
    },
    setBaseFilePath(filePath) {
      baseFilePath = filePath
    },
    destroy() {
      worker.destroy()
      if (idleHandle != null) {
        if (scheduledWithRaf) cancelAnimationFrame(idleHandle)
        else if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle)
      }
    },
  }
}

/**
 * Resolve any <img src> / <a href> in `host` that lacks a protocol into a
 * `file://` absolute URL relative to the active document's directory. Without
 * this rewrite the renderer's file:// base would resolve relative paths
 * against `out/renderer/` rather than the actual document folder.
 */
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
