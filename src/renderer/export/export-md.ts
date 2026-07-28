import type { AppContext } from '../context'
import { resolveExportDialog } from './export-dialog'

interface ExportDeps {
  ctx: AppContext
  content: string
  title: string
}

export async function exportMarkdown(deps: ExportDeps): Promise<boolean> {
  const filePath = await resolveExportDialog(deps, 'md', 'Markdown')
  if (!filePath) return false
  const result = await deps.ctx.api.fileSave(filePath, deps.content)
  return result.success
}
