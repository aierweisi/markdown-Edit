import { BrowserWindow, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import { resolve as pathResolve } from 'node:path'
import { CH, ExportPdfReqSchema, type ExportPdfResp } from '@shared/ipc'
import { isPathSafe } from '../security/isPathSafe'

export function registerExportIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(CH.EXPORT_PDF, async (_event, raw: unknown): Promise<ExportPdfResp> => {
    const parsed = ExportPdfReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }

    const resolved = pathResolve(parsed.data.savePath)
    if (!isPathSafe(resolved)) return { success: false, error: 'invalid path' }

    const win = getWindow()
    if (!win) return { success: false, error: 'no window' }

    try {
      const marginsMap = ['default', 'none', 'printableArea'] as const
      const buf = await win.webContents.printToPDF({
        pageSize: parsed.data.pageSize,
        landscape: parsed.data.landscape,
        margins: { marginType: marginsMap[parsed.data.marginsType] },
        printBackground: true,
        ...(parsed.data.pageNumbers
          ? {
              displayHeaderFooter: true,
              headerTemplate: '<span></span>',
              footerTemplate:
                '<div style="font-size:9px;width:100%;text-align:center;color:#888">第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</div>',
            }
          : {}),
      })
      writeFileSync(resolved, buf)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
