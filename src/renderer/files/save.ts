import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import type { FileSaveResp } from '@shared/ipc'
import { resolveNamingRule, sanitizeFileName, titleFromPath } from '../lib/fs-paths'
import { showToast } from '../ui/toast'

interface SaveDeps {
  ctx: AppContext
  tabs: TabManager
  getCurrentContent(): string
}

/** Returns the save outcome (carrying post-write mtime/size on success), or
 *  `null` when the user canceled the save-as dialog. Callers treat anything
 *  non-null as "a save was attempted" and read `.success`. */
export async function saveActiveTab(deps: SaveDeps, saveAs = false): Promise<FileSaveResp | null> {
  const tab = deps.tabs.getActive()
  if (!tab) return null

  const content = deps.getCurrentContent()
  let filePath = tab.filePath

  if (!filePath || saveAs) {
    const exportDir = (await deps.ctx.api.storeGet('exportDir')) ?? ''
    const namingRule = (await deps.ctx.api.storeGet('exportNamingRule')) ?? '{title}_{date}'

    const baseName =
      tab.title && tab.title !== '未命名'
        ? sanitizeFileName(tab.title)
        : resolveNamingRule(namingRule, { content })

    const defaultPath = exportDir ? `${exportDir}/${baseName}.md` : `${baseName}.md`

    const dialog = await deps.ctx.api.dialogSaveFile({
      defaultPath,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'txt'] },
      ],
    })
    if (dialog.canceled || !dialog.filePath) return null
    filePath = dialog.filePath
    const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    if (dir) await deps.ctx.api.storeSet('exportDir', dir)
  }

  deps.ctx.store.saving.set(true)
  try {
    const result = await deps.ctx.api.fileSave(filePath, content)
    if (!result.success) {
      console.error('[save] fileSave failed:', result.error)
      showToast(`保存失败: ${result.error}`, 'error')
      return result
    }
    deps.tabs.setTitle(tab.id, titleFromPath(filePath), filePath)
    deps.tabs.markModified(tab.id, false)
    return result
  } finally {
    deps.ctx.store.saving.set(false)
  }
}
