import type { EditorApi } from '../editor/editor-api'

interface SyncScrollOpts {
  editor: EditorApi
  previewContainer: HTMLElement
}

export function attachSyncScroll(opts: SyncScrollOpts): () => void {
  let suspended = false
  const editorEl = opts.editor.view.scrollDOM
  const previewEl = opts.previewContainer

  function onEditor(): void {
    if (suspended) return
    suspended = true
    const ratio = editorEl.scrollTop / Math.max(1, editorEl.scrollHeight - editorEl.clientHeight)
    previewEl.scrollTop = ratio * Math.max(1, previewEl.scrollHeight - previewEl.clientHeight)
    requestAnimationFrame(() => (suspended = false))
  }

  function onPreview(): void {
    if (suspended) return
    suspended = true
    const ratio = previewEl.scrollTop / Math.max(1, previewEl.scrollHeight - previewEl.clientHeight)
    editorEl.scrollTop = ratio * Math.max(1, editorEl.scrollHeight - editorEl.clientHeight)
    requestAnimationFrame(() => (suspended = false))
  }

  editorEl.addEventListener('scroll', onEditor, { passive: true })
  previewEl.addEventListener('scroll', onPreview, { passive: true })

  return () => {
    editorEl.removeEventListener('scroll', onEditor)
    previewEl.removeEventListener('scroll', onPreview)
  }
}
