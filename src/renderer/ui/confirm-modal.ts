export interface ConfirmOpts {
  title?: string
  message: string
  okText?: string
  cancelText?: string
  danger?: boolean
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
}

export function showConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay confirm-overlay'
    overlay.innerHTML = `
      <div class="modal modal-small">
        <div class="modal-header"><h2>${escape(opts.title ?? '确认')}</h2></div>
        <div class="modal-body">
          <p class="confirm-message">${escape(opts.message)}</p>
          <div class="modal-actions">
            <button class="btn-secondary confirm-cancel">${escape(opts.cancelText ?? '取消')}</button>
            <button class="${
              opts.danger ? 'btn-danger' : 'btn-primary'
            } confirm-ok">${escape(opts.okText ?? '确定')}</button>
          </div>
        </div>
      </div>`
    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('open'))

    let closed = false
    function close(result: boolean): void {
      if (closed) return
      closed = true
      overlay.classList.remove('open')
      overlay.classList.add('closing')
      document.removeEventListener('keydown', onKey, true)
      setTimeout(() => overlay.remove(), 220)
      resolve(result)
    }
    function onKey(evt: KeyboardEvent): void {
      if (closed) return
      if (evt.key === 'Escape') {
        evt.preventDefault()
        close(false)
      } else if (evt.key === 'Enter') {
        evt.preventDefault()
        close(true)
      }
    }
    overlay.querySelector('.confirm-ok')?.addEventListener('click', () => close(true))
    overlay.querySelector('.confirm-cancel')?.addEventListener('click', () => close(false))
    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) close(false)
    })
    document.addEventListener('keydown', onKey, true)
    setTimeout(
      () => (overlay.querySelector('.confirm-ok') as HTMLElement | null)?.focus(),
      60,
    )
  })
}

export type CloseChoice = 'save' | 'discard' | 'cancel'

export interface ConfirmCloseOpts {
  title?: string
  message: string
  saveText?: string
  discardText?: string
  cancelText?: string
}

export function showCloseConfirm(opts: ConfirmCloseOpts): Promise<CloseChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay confirm-overlay'
    overlay.innerHTML = `
      <div class="modal modal-small">
        <div class="modal-header"><h2>${escape(opts.title ?? '关闭确认')}</h2></div>
        <div class="modal-body">
          <p class="confirm-message">${escape(opts.message)}</p>
          <div class="modal-actions">
            <button class="btn-secondary confirm-cancel">${escape(opts.cancelText ?? '取消')}</button>
            <button class="btn-danger confirm-discard">${escape(opts.discardText ?? '不保存')}</button>
            <button class="btn-primary confirm-save">${escape(opts.saveText ?? '保存')}</button>
          </div>
        </div>
      </div>`
    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('open'))

    let closed = false
    function done(choice: CloseChoice): void {
      if (closed) return
      closed = true
      overlay.classList.remove('open')
      overlay.classList.add('closing')
      document.removeEventListener('keydown', onKey, true)
      setTimeout(() => overlay.remove(), 220)
      resolve(choice)
    }
    function onKey(evt: KeyboardEvent): void {
      if (closed) return
      if (evt.key === 'Escape') {
        evt.preventDefault()
        done('cancel')
      } else if (evt.key === 'Enter') {
        evt.preventDefault()
        done('save')
      }
    }
    overlay.querySelector('.confirm-save')?.addEventListener('click', () => done('save'))
    overlay.querySelector('.confirm-discard')?.addEventListener('click', () => done('discard'))
    overlay.querySelector('.confirm-cancel')?.addEventListener('click', () => done('cancel'))
    overlay.addEventListener('click', (evt) => {
      if (evt.target === overlay) done('cancel')
    })
    document.addEventListener('keydown', onKey, true)
    setTimeout(
      () => (overlay.querySelector('.confirm-save') as HTMLElement | null)?.focus(),
      60,
    )
  })
}
