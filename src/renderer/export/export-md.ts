import type { AppContext } from '../context'
import { showToast } from '../ui/toast'
import { resolveExportDialog } from './export-dialog'

interface ExportDeps {
  ctx: AppContext
  content: string
  title: string
}

export async function exportMarkdown(deps: ExportDeps): Promise<boolean> {
  const filePath = await resolveExportDialog(deps, 'md', 'Markdown')
  if (!filePath) return false // user canceled — silent
  // create:true — the dialog path is always a fresh output file.
  const result = await deps.ctx.api.fileSave(filePath, deps.content, true)
  if (!result.success) {
    showToast(`导出失败: ${result.error}`, 'error')
    return false
  }
  return true
}
