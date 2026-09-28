import type { RenderRequest, RenderResponse } from '../workers/markdown.worker'

export interface MarkdownWorkerClient {
  render(text: string): Promise<string>
  destroy(): void
}

export function createMarkdownWorkerClient(): MarkdownWorkerClient {
  let nextId = 1
  const pending = new Map<number, (resp: RenderResponse) => void>()

  // Reject every outstanding render so a failed/never-arriving response can't
  // leave the preview hanging on a stale pending promise.
  const failAll = (err: unknown): void => {
    const message = err instanceof Error ? err.message : 'worker error'
    for (const resolver of pending.values()) {
      resolver({ id: -1, html: '', error: message })
    }
    pending.clear()
  }

  let disposed = false
  // Load-failure guard: if the worker script itself fails to load (e.g. a
  // missing chunk in a packaged build), the constructor's error event used to
  // trigger an immediate recreate — a free-spinning constructor/error loop.
  // `healthy` distinguishes "crashed mid-session" (first render answered)
  // from "never came up": the former revives immediately, the latter retries
  // with backoff and gives up, after which render() fails fast instead of
  // posting into a dead worker and hanging.
  const MAX_STARTUP_RETRIES = 5
  let healthy = false
  let startupRetries = 0
  let reviveTimer: ReturnType<typeof setTimeout> | null = null

  function createWorker(): Worker {
    const w = new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), {
      type: 'module',
    })
    w.onmessage = (evt: MessageEvent<RenderResponse>): void => {
      const resolver = pending.get(evt.data.id)
      if (resolver) {
        healthy = true
        startupRetries = 0
        pending.delete(evt.data.id)
        resolver(evt.data)
      }
    }
    w.onerror = (e: ErrorEvent): void => {
      failAll(e.error ?? new Error(e.message))
      if (disposed) return
      if (healthy) {
        // The worker has died — postMessage to a terminated worker resolves
        // the call but never delivers, so every render after this would hang
        // forever. Recreate so subsequent renders work again.
        healthy = false
        worker = createWorker()
        return
      }
      startupRetries++
      if (startupRetries > MAX_STARTUP_RETRIES) return
      reviveTimer = setTimeout(() => {
        reviveTimer = null
        if (!disposed) worker = createWorker()
      }, 200 * startupRetries)
    }
    w.onmessageerror = (): void => failAll(new Error('worker message error'))
    return w
  }

  let worker: Worker = createWorker()

  return {
    render(text) {
      const id = nextId++
      return new Promise<string>((resolve, reject) => {
        if (startupRetries > MAX_STARTUP_RETRIES) {
          reject(new Error('markdown worker 未能加载，预览不可用'))
          return
        }
        pending.set(id, (resp) => {
          if (resp.error) reject(new Error(resp.error))
          else resolve(resp.html)
        })
        const req: RenderRequest = { id, text }
        worker.postMessage(req)
      })
    },
    destroy() {
      disposed = true
      if (reviveTimer != null) clearTimeout(reviveTimer)
      worker.terminate()
      pending.clear()
    },
  }
}
