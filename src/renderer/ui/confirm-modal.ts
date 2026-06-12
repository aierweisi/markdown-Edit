export interface ConfirmOpts {
  title?: string
  message: string
  okText?: string
  cancelText?: string
  danger?: boolean
}

export function showConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay modal-overlay--open'

    const modal = document.createElement('div')
    modal.className = 'modal modal--small'
    modal.innerHTML = `
      <div class="modal__header"><h2>${escape(opts.title ?? '确认')}</h2></div>
      <div class="modal__body">
        <p>${escape(opts.message)}</p>
        <div class="modal__actions">
          <button type="button" class="btn btn--secondary" data-act="cancel">${escape(
            opts.cancelText ?? '取消',
          )}</button>
          <button type="button" class="btn ${
            opts.danger ? 'btn--danger' : 'btn--primary'
          }" data-act="ok">${escape(opts.okText ?? '确定')}</button>
        </div>
      </div>`
    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    function cleanup(result: boolean): void {
      overlay.remove()
      document.removeEventListener('keydown', onKey)
      resolve(result)
    }
    function onKey(evt: KeyboardEvent): void {
      if (evt.key === 'Escape') cleanup(false)
      if (evt.key === 'Enter') cleanup(true)
    }
    overlay.addEventListener('click', (evt) => {
      const t = evt.target as HTMLElement
      const act = t.dataset.act
      if (act === 'cancel' || evt.target === overlay) cleanup(false)
      if (act === 'ok') cleanup(true)
    })
    document.addEventListener('keydown', onKey)
  })
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
}
