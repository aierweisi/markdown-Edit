import type { AppContext } from '../context'
import type { PdfExportOptions } from '@shared/types'
import { DEFAULT_PDF_OPTIONS } from '@shared/ipc'
import { resolveExportDialog } from './export-dialog'
import { promptPdfOptions } from './pdf-options-dialog'

interface ExportPdfDeps {
  ctx: AppContext
  content: string
  title: string
}

export async function exportPdf(deps: ExportPdfDeps): Promise<boolean> {
  const filePath = await resolveExportDialog(deps, 'pdf', 'PDF')
  if (!filePath) return false
  // Ask for page setup (pre-filled with last-used options) before rendering.
  const stored = await deps.ctx.api.storeGet('pdfOptions')
  const current: PdfExportOptions = stored ?? DEFAULT_PDF_OPTIONS
  const chosen = await promptPdfOptions(current)
  if (!chosen) return false
  await deps.ctx.api.storeSet('pdfOptions', chosen)
  const result = await deps.ctx.api.exportPDF({ savePath: filePath, ...chosen })
  return result.success
}
