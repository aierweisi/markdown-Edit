import type { AppContext } from '../context'
import { resolveExportDialog } from './export-dialog'

interface ExportPdfDeps {
  ctx: AppContext
  content: string
  title: string
}

export async function exportPdf(deps: ExportPdfDeps): Promise<boolean> {
  const filePath = await resolveExportDialog(deps, 'pdf', 'PDF')
  if (!filePath) return false
  const result = await deps.ctx.api.exportPDF({ savePath: filePath })
  return result.success
}
