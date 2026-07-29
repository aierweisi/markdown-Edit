import type { PdfExportOptions } from '@shared/types'

/**
 * Show a modal to collect PDF export options. Returns the chosen options, or
 * null if the user cancels. Self-contained: builds its own overlay (reusing the
 * existing .modal-overlay / .modal styles) and removes it on close.
 */
export function promptPdfOptions(current: PdfExportOptions): Promise<PdfExportOptions | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay open'
    overlay.innerHTML = `
      <div class="modal modal-small" style="width: 380px">
        <div class="modal-header"><h2>导出 PDF 选项</h2></div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px">
          <div class="setting-item" style="padding: 0">
            <div class="setting-item-info"><div class="setting-item-label">纸张大小</div></div>
            <div class="setting-item-control">
              <select id="pdf-opt-pagesize">
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </div>
          </div>
          <div class="setting-item" style="padding: 0">
            <div class="setting-item-info"><div class="setting-item-label">方向</div></div>
            <div class="setting-item-control">
              <select id="pdf-opt-landscape">
                <option value="false">纵向</option>
                <option value="true">横向</option>
              </select>
            </div>
          </div>
          <div class="setting-item" style="padding: 0">
            <div class="setting-item-info"><div class="setting-item-label">边距</div></div>
            <div class="setting-item-control">
              <select id="pdf-opt-margins">
                <option value="0">默认</option>
                <option value="1">无</option>
                <option value="2">最小</option>
              </select>
            </div>
          </div>
          <div class="setting-item" style="padding: 0">
            <div class="setting-item-info">
              <div class="setting-item-label">显示页码</div>
              <div class="setting-item-desc">在页脚添加页码(取决于系统打印支持)</div>
            </div>
            <div class="setting-item-control"><input type="checkbox" id="pdf-opt-pagenum" /></div>
          </div>
        </div>
        <div class="modal-actions" style="justify-content: flex-end">
          <button class="btn-secondary" id="pdf-opt-cancel">取消</button>
          <button class="btn-primary" id="pdf-opt-ok">导出</button>
        </div>
      </div>`

    document.body.appendChild(overlay)

    const pageSizeEl = overlay.querySelector<HTMLSelectElement>('#pdf-opt-pagesize')!
    const landscapeEl = overlay.querySelector<HTMLSelectElement>('#pdf-opt-landscape')!
    const marginsEl = overlay.querySelector<HTMLSelectElement>('#pdf-opt-margins')!
    const pageEl = overlay.querySelector<HTMLInputElement>('#pdf-opt-pagenum')!

    pageSizeEl.value = current.pageSize
    landscapeEl.value = String(current.landscape)
    marginsEl.value = String(current.marginsType)
    pageEl.checked = current.pageNumbers

    const finish = (val: PdfExportOptions | null): void => {
      overlay.remove()
      document.removeEventListener('keydown', onEsc)
      resolve(val)
    }
    const read = (): PdfExportOptions => ({
      pageSize: pageSizeEl.value as PdfExportOptions['pageSize'],
      landscape: landscapeEl.value === 'true',
      marginsType: Number(marginsEl.value) as 0 | 1 | 2,
      pageNumbers: pageEl.checked,
    })
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(null)
    }

    overlay.querySelector('#pdf-opt-ok')!.addEventListener('click', () => finish(read()))
    overlay.querySelector('#pdf-opt-cancel')!.addEventListener('click', () => finish(null))
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(null)
    })
    document.addEventListener('keydown', onEsc)
  })
}
