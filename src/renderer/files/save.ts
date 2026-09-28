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

/** Per-tab save serialization shared by manual save (saveActiveTab) and
 *  autosave. Concurrent non-atomic writeFile calls to the same path can
 *  interleave or let an older snapshot land after a newer one — while the
 *  dirty flag is already cleared, so nothing corrects the divergence. Savers
 *  for one tab queue behind the in-flight write instead of overlapping it.
 *  The chain entry self-cleans once idle. */
const saveChains = new Map<string, Promise<unknown>>()

export function serializeSave<T>(tabId: string, run: () => Promise<T>): Promise<T> {
  const prev = saveChains.get(tabId) ?? Promise.resolve()
  const next = prev.then(run, run)
  // The stored chain only orders contenders, never propagates their errors.
  const chain = next.catch(() => {})
  saveChains.set(tabId, chain)
  void chain.then(() => {
    if (saveChains.get(tabId) === chain) saveChains.delete(tabId)
  })
  return next
}

/** Resolve once no save for `tabId` is queued or in flight (best effort —
 *  used by close-discard flows so a just-fired autosave can't land after the
 *  user chose "不保存"). */
export function whenTabSaveSettled(tabId: string): Promise<unknown> {
  return saveChains.get(tabId) ?? Promise.resolve()
}

/** The exclusive write for one tab: flips the saving signal, performs the IPC
 *  write and the post-save bookkeeping. Runs one-at-a-time per tab (queued by
 *  serializeSave). */
async function writeTab(
  deps: SaveDeps,
  tabId: string,
  filePath: string,
  content: string,
  create: boolean,
): Promise<FileSaveResp> {
  deps.ctx.store.saving.set(true)
  try {
    const result = await deps.ctx.api.fileSave(filePath, content, create)
    if (result.success) {
      deps.tabs.setTitle(tabId, titleFromPath(filePath), filePath)
      // Clear the dirty flag only when the tab still holds exactly what we
      // wrote: keystrokes typed during the await must keep their "modified"
      // state, or no later autosave would consider them un-persisted.
      if (deps.tabs.getContent(tabId) === content) deps.tabs.markModified(tabId, false)
    }
    return result
  } finally {
    deps.ctx.store.saving.set(false)
  }
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
    // Hold the saving signal while the dialog is open: a pending autosave
    // firing mid-dialog would write the OLD path with the current content,
    // defeating a "save a copy / fork" intent.
    deps.ctx.store.saving.set(true)
    let dialog: Awaited<ReturnType<typeof deps.ctx.api.dialogSaveFile>>
    try {
      const exportDir = (await deps.ctx.api.storeGet('exportDir')) ?? ''
      const namingRule = (await deps.ctx.api.storeGet('exportNamingRule')) ?? '{title}_{date}'

      const baseName =
        tab.title && tab.title !== '未命名'
          ? sanitizeFileName(tab.title)
          : resolveNamingRule(namingRule, { content })

      const defaultPath = exportDir ? `${exportDir}/${baseName}.md` : `${baseName}.md`

      dialog = await deps.ctx.api.dialogSaveFile({
        defaultPath,
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'txt'] },
        ],
      })
    } finally {
      deps.ctx.store.saving.set(false)
    }
    if (dialog.canceled || !dialog.filePath) return null
    filePath = dialog.filePath
    create = true // fresh path from the dialog → allowed to create
    const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    if (dir) await deps.ctx.api.storeSet('exportDir', dir)
  }

  const result = await serializeSave(tab.id, () => writeTab(deps, tab.id, filePath, content, create))
  if (!result.success) {
    // 原路径已被外部移动/删除:fileSave 拒绝写回旧路径"复活"文件(moved:true),
    // 引导用户另存为新文件(递归走 save-as 流程,create:true)。重试在序列化区
    // 之外进行——否则递归的 serializeSave 会排队等待自己,死锁。
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
  }
  return result
}
