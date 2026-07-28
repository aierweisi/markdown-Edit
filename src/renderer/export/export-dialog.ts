import type { AppContext } from '../context'
import { resolveNamingRule, sanitizeFileName } from '../lib/fs-paths'

interface ExportBaseDeps {
  ctx: AppContext
  content: string
  title: string
}

/**
 * Resolve the configured export directory + naming rule, build a default save
 * path, and prompt the user with the OS save dialog. Returns the chosen file
 * path, or null if the user cancelled.
 *
 * Shared by the markdown / html / pdf exporters so the naming + dialog
 * boilerplate isn't duplicated in each.
 */
export async function resolveExportDialog(
  deps: ExportBaseDeps,
  ext: string,
  filterName: string,
): Promise<string | null> {
  const exportDir = (await deps.ctx.api.storeGet('exportDir')) ?? ''
  const namingRule = (await deps.ctx.api.storeGet('exportNamingRule')) ?? '{title}_{date}'
  const baseName =
    deps.title && deps.title !== '未命名'
      ? sanitizeFileName(deps.title)
      : resolveNamingRule(namingRule, { content: deps.content })
  const defaultPath = exportDir ? `${exportDir}/${baseName}.${ext}` : `${baseName}.${ext}`

  const dialog = await deps.ctx.api.dialogSaveFile({
    defaultPath,
    filters: [{ name: filterName, extensions: [ext] }],
  })
  if (dialog.canceled || !dialog.filePath) return null
  return dialog.filePath
}
