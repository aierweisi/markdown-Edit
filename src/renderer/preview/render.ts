import DOMPurify from 'dompurify'
import morphdom from 'morphdom'
import { createMarkdownWorkerClient, type MarkdownWorkerClient } from './worker-client'
import { renderMermaidIn } from './lazy-mermaid'
import { renderMathIn } from './lazy-katex'

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
  let baseFilePath: string | null = null

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
        })
        .catch((err) => {
          console.error('[preview] render failed:', err)
        })
    }

    if (typeof requestIdleCallback === 'function') {
      idleHandle = requestIdleCallback(flush, { timeout: 100 }) as unknown as number
    } else {
      idleHandle = window.requestAnimationFrame(flush)
    }
  }

  function applyHtml(rawHtml: string): void {
    const clean = DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'rel'],
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
      if (idleHandle != null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleHandle)
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
