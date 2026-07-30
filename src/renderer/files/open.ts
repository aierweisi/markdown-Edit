import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import type { EditorApi } from '../editor/editor-api'
import { titleFromPath } from '../lib/fs-paths'
import { showToast } from '../ui/toast'

interface OpenDeps {
  ctx: AppContext
  tabs: TabManager
  editor: EditorApi
  onContentLoaded?(content: string): void
}

/**
 * Open file via dialog. If the file is already in an open tab, switch to it.
 * Otherwise create a new tab; close the current blank draft if applicable.
 */
export async function openFileViaDialog(deps: OpenDeps): Promise<void> {
  const result = await deps.ctx.api.dialogOpenFile()
  if (result.canceled || result.filePaths.length === 0) return
  await openFileByPath(deps, result.filePaths[0])
}

export async function openFileByPath(deps: OpenDeps, filePath: string): Promise<void> {
  const existing = deps.tabs.getAll().find((t) => t.filePath === filePath)
  if (existing) {
    deps.tabs.setActive(existing.id)
    deps.editor.setValue(deps.tabs.getContent(existing.id))
    deps.editor.focus()
    deps.onContentLoaded?.(deps.tabs.getContent(existing.id))
    return
  }

  const read = await deps.ctx.api.fileRead(filePath)
  if (!read.success) {
    showToast(`打开失败: ${read.error}`, 'error')
    return
  }

  closeBlankDraftIfAny(deps)

  const tab = deps.tabs.create({
    title: titleFromPath(filePath),
    filePath,
    content: read.content,
  })
  deps.tabs.setActive(tab.id)
  deps.tabs.markModified(tab.id, false)
  deps.editor.setValue(read.content)
  deps.editor.focus()
  deps.onContentLoaded?.(read.content)
}

function closeBlankDraftIfAny(deps: OpenDeps): void {
  const active = deps.tabs.getActive()
  if (!active) return
  if (active.filePath || active.modified) return
  const content = deps.tabs.getContent(active.id)
  if (content.trim().length > 0) return
  deps.tabs.close(active.id)
}
