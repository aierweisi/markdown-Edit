import DOMPurify from 'dompurify'
import morphdom from 'morphdom'
import { createMarkdownWorkerClient, type MarkdownWorkerClient } from './worker-client'

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
          if (renderingFor !== text) return // a newer render is queued
          applyHtml(html)
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
    // Wrap in a temp container; morphdom diffs children of opts.body.
    const tmp = document.createElement('article')
    tmp.className = opts.body.className
    tmp.innerHTML = clean
    morphdom(opts.body, tmp, { childrenOnly: true })
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
