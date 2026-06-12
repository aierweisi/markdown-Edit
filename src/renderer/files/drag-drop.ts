import type { AppContext } from '../context'
import { isMdFile } from '@shared/paths'
import { openFileByPath } from './open'
import type { TabManager } from '../tabs/tab-manager'
import type { EditorApi } from '../editor/editor-api'

interface DragDropOpts {
  ctx: AppContext
  tabs: TabManager
  editor: EditorApi
  onAfterOpen?(content: string): void
}

export function attachDragDrop(opts: DragDropOpts): () => void {
  const container = opts.ctx.dom.editorContainer
  if (!container) return () => undefined

  const dragClass = 'editor-container--drag-over'

  function onDragOver(evt: DragEvent): void {
    if (!evt.dataTransfer?.types.includes('Files')) return
    evt.preventDefault()
    container!.classList.add(dragClass)
  }

  function onDragLeave(evt: DragEvent): void {
    if (!evt.relatedTarget || !container!.contains(evt.relatedTarget as Node)) {
      container!.classList.remove(dragClass)
    }
  }

  async function onDrop(evt: DragEvent): Promise<void> {
    evt.preventDefault()
    container!.classList.remove(dragClass)
    const files = Array.from(evt.dataTransfer?.files ?? [])
    for (const file of files) {
      if (!isMdFile(file.name)) continue
      const filePath = opts.ctx.api.getFilePath(file)
      if (!filePath) continue
      await openFileByPath(
        { ctx: opts.ctx, tabs: opts.tabs, editor: opts.editor, onContentLoaded: opts.onAfterOpen },
        filePath,
      )
    }
  }

  document.addEventListener('dragover', onDragOver)
  document.addEventListener('dragleave', onDragLeave)
  document.addEventListener('drop', onDrop)
  return () => {
    document.removeEventListener('dragover', onDragOver)
    document.removeEventListener('dragleave', onDragLeave)
    document.removeEventListener('drop', onDrop)
  }
}
