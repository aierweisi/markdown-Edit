import DOMPurify from 'dompurify'
import morphdom from 'morphdom'
import { createMarkdownWorkerClient, type MarkdownWorkerClient } from './worker-client'
import { renderMermaidIn } from './lazy-mermaid'
import { renderMathIn } from './lazy-katex'

export interface PreviewApi {
  render(text: string): void
  destroy(): void
}

interface PreviewOpts {
  body: HTMLElement
}

export function createPreview(opts: PreviewOpts): PreviewApi {
  const worker: MarkdownWorkerClient = createMarkdownWorkerClient()
  let pendingText: string | null = null
  let renderingFor: string | null = null
  let idleHandle: number | null = null

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
          // post-processing: mermaid + katex
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
    destroy() {
      worker.destroy()
      if (idleHandle != null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleHandle)
      }
    },
  }
}
