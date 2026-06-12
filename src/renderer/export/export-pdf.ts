import type { AppContext } from '../context'
import { resolveNamingRule, sanitizeFileName } from '../lib/fs-paths'

interface ExportPdfDeps {
  ctx: AppContext
  content: string
  title: string
}

export async function exportPdf(deps: ExportPdfDeps): Promise<boolean> {
  const exportDir = (await deps.ctx.api.storeGet('exportDir')) ?? ''
  const namingRule = (await deps.ctx.api.storeGet('exportNamingRule')) ?? '{title}_{date}'
  const baseName =
    deps.title && deps.title !== '未命名'
      ? sanitizeFileName(deps.title)
      : resolveNamingRule(namingRule, { content: deps.content })
  const defaultPath = exportDir ? `${exportDir}/${baseName}.pdf` : `${baseName}.pdf`

  const dialog = await deps.ctx.api.dialogSaveFile({
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (dialog.canceled || !dialog.filePath) return false

  const result = await deps.ctx.api.exportPDF({ savePath: dialog.filePath })
  return result.success
}
