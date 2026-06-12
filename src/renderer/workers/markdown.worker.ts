/// <reference lib="webworker" />
import { marked } from 'marked'

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
