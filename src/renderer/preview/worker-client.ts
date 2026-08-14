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

  function createWorker(): Worker {
    const w = new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), {
      type: 'module',
    })
    w.onmessage = (evt: MessageEvent<RenderResponse>): void => {
      const resolver = pending.get(evt.data.id)
      if (resolver) {
        pending.delete(evt.data.id)
        resolver(evt.data)
      }
    }
    w.onerror = (e: ErrorEvent): void => {
      failAll(e.error ?? new Error(e.message))
      // The worker has died — postMessage to a terminated worker resolves the
      // call but never delivers, so every render after this would hang forever
      // and the preview would freeze with no error. Recreate the worker so
      // subsequent renders work again. Guarded so dispose() can't race a
      // resurrection (and so a worker that crashes on every parse won't loop:
      // destroy() flips `disposed` on teardown).
      if (disposed) return
      worker = createWorker()
    }
    w.onmessageerror = (): void => failAll(new Error('worker message error'))
    return w
  }

  let worker: Worker = createWorker()

  return {
    render(text) {
      const id = nextId++
      return new Promise<string>((resolve, reject) => {
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
      worker.terminate()
      pending.clear()
    },
  }
}
