type ToastKind = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  run(): void
}

const ACTIVE_TIMEOUT_MS = 2500
// Actionable toasts (e.g. save-failed → 重试) stick around longer so the
// button is actually reachable.
const ACTIVE_TIMEOUT_WITH_ACTION_MS = 6000
// Cap concurrent toasts so a burst (e.g. repeated autosave failures) doesn't
// stack a tall column over the UI. Drop the oldest still-visible one first.
const MAX_VISIBLE = 4

export function showToast(message: string, kind: ToastKind = 'info', action?: ToastAction): void {
  let host = document.getElementById('toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'toast-host'
    document.body.appendChild(host)
  }
  const visible = host.querySelectorAll<HTMLElement>('.toast:not(.toast--leaving)')
  if (visible.length >= MAX_VISIBLE) visible[0].remove()
  const toast = document.createElement('div')
  toast.className = `toast toast--${kind}`
  if (action) toast.classList.add('toast--actionable')
  toast.textContent = message
  if (action) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'toast-action'
    btn.textContent = action.label
    btn.addEventListener('click', () => {
      dismiss()
      action.run()
    })
    toast.appendChild(btn)
  }
  host.appendChild(toast)
  const dismiss = (): void => {
    if (!toast.isConnected) return
    toast.classList.add('toast--leaving')
    setTimeout(() => toast.remove(), 220)
  }
  setTimeout(dismiss, action ? ACTIVE_TIMEOUT_WITH_ACTION_MS : ACTIVE_TIMEOUT_MS)
}
