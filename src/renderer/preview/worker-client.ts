import type { RenderRequest, RenderResponse } from '../workers/markdown.worker'

export interface MarkdownWorkerClient {
  render(text: string): Promise<string>
  destroy(): void
}

export function createMarkdownWorkerClient(): MarkdownWorkerClient {
  const worker = new Worker(new URL('../workers/markdown.worker.ts', import.meta.url), {
    type: 'module',
  })

  let nextId = 1
  const pending = new Map<number, (resp: RenderResponse) => void>()

  worker.onmessage = (evt: MessageEvent<RenderResponse>): void => {
    const resolver = pending.get(evt.data.id)
    if (resolver) {
      pending.delete(evt.data.id)
      resolver(evt.data)
    }
  }

  // If the worker throws uncaughtly (or a message fails to deserialize), reject
  // every outstanding render so previews never hang on a stale pending promise.
  const failAll = (err: unknown): void => {
    const message = err instanceof Error ? err.message : 'worker error'
    for (const resolver of pending.values()) {
      resolver({ id: -1, html: '', error: message })
    }
    pending.clear()
  }
  worker.onerror = (e: ErrorEvent): void => failAll(e.error ?? new Error(e.message))
  worker.onmessageerror = (): void => failAll(new Error('worker message error'))

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
      worker.terminate()
      pending.clear()
    },
  }
}
