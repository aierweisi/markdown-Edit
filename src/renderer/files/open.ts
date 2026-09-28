import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import type { EditorApi } from '../editor/editor-api'
import { titleFromPath } from '../lib/fs-paths'
import { showToast } from '../ui/toast'

interface OpenDeps {
  ctx: AppContext
  tabs: TabManager
  editor: EditorApi
  /** stat carries the post-read mtime/size so the caller can prime a file-sync baseline. */
  onContentLoaded?(content: string, stat?: { mtimeMs: number; size: number }): void
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

// In-flight open dedup: the workspace/recent panels fire onOpenFile per click
// with no double-click suppression, and two rapid clicks for the same path
// both pass the "already open?" check (it runs before the fileRead await) and
// create duplicate tabs — each with its own file-sync baseline, prompting
// "外部已修改" against the other. Concurrent opens of one path now share a
// single flight; the second caller just awaits the first one's tab.
const inFlightOpens = new Map<string, Promise<void>>()

export function openFileByPath(deps: OpenDeps, filePath: string): Promise<void> {
  const existingFlight = inFlightOpens.get(filePath)
  if (existingFlight) return existingFlight
  const flight = openFileByPathInner(deps, filePath).finally(() => {
    inFlightOpens.delete(filePath)
  })
  inFlightOpens.set(filePath, flight)
  return flight
}

async function openFileByPathInner(deps: OpenDeps, filePath: string): Promise<void> {
  const existing = deps.tabs.getAll().find((t) => t.filePath === filePath)
  if (existing) {
    deps.tabs.setActive(existing.id)
    deps.editor.openTab(existing.id, deps.tabs.getContent(existing.id))
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
  deps.editor.openTab(tab.id, read.content)
  deps.editor.focus()
  deps.onContentLoaded?.(read.content, { mtimeMs: read.mtimeMs, size: read.size })
}

function closeBlankDraftIfAny(deps: OpenDeps): void {
  const active = deps.tabs.getActive()
  if (!active) return
  if (active.filePath || active.modified) return
  const content = deps.tabs.getContent(active.id)
  if (content.trim().length > 0) return
  deps.tabs.close(active.id)
}
