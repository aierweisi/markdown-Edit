import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import type { FileSaveResp } from '@shared/ipc'
import { resolveNamingRule, sanitizeFileName, titleFromPath } from '../lib/fs-paths'
import { showConfirm } from '../ui/confirm-modal'
import { showToast } from '../ui/toast'

interface SaveDeps {
  ctx: AppContext
  tabs: TabManager
  /** Save a specific tab instead of the active one (close-tab confirm flows).
   *  Content always comes from tabs.getContent: onChange keeps the active
   *  tab's entry fresh, and switchActive stores the editor text back on the
   *  way out — so the snapshot is this tab's own text even if the user
   *  switches tabs mid-save. */
  tabId?: string
}

/** Returns the save outcome (carrying post-write mtime/size on success), or
 *  `null` when the user canceled the save-as dialog. Callers treat anything
 *  non-null as "a save was attempted" and read `.success`. */
export async function saveActiveTab(deps: SaveDeps, saveAs = false): Promise<FileSaveResp | null> {
  const tab = deps.tabId ? deps.tabs.getById(deps.tabId) : deps.tabs.getActive()
  if (!tab) return null

  // Snapshot before any await — an await yields and the active tab may change.
  const content = deps.tabs.getContent(tab.id)
  let filePath = tab.filePath
  let create = false

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
    create = true // fresh path from the dialog → allowed to create
    const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    if (dir) await deps.ctx.api.storeSet('exportDir', dir)
  }

  deps.ctx.store.saving.set(true)
  try {
    const result = await deps.ctx.api.fileSave(filePath, content, create)
    if (!result.success) {
      // 原路径已被外部移动/删除:fileSave 拒绝写回旧路径"复活"文件(moved:true),
      // 引导用户另存为新文件(递归走 save-as 流程,create:true)。
      if (result.moved && !saveAs) {
        const ok = await showConfirm({
          title: '文件已移动或删除',
          message: `“${tab.title}” 的原路径已不存在,是否另存为新文件?`,
          okText: '另存为',
          cancelText: '取消',
          danger: true,
        })
        if (!ok) return null
        return saveActiveTab(deps, true)
      }
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
