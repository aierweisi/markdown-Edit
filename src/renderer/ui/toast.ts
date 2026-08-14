type ToastKind = 'info' | 'success' | 'error'

const ACTIVE_TIMEOUT_MS = 2500
// Cap concurrent toasts so a burst (e.g. repeated autosave failures) doesn't
// stack a tall column over the UI. Drop the oldest still-visible one first.
const MAX_VISIBLE = 4

export function showToast(message: string, kind: ToastKind = 'info'): void {
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
  toast.textContent = message
  host.appendChild(toast)
  setTimeout(() => {
    toast.classList.add('toast--leaving')
    setTimeout(() => toast.remove(), 220)
  }, ACTIVE_TIMEOUT_MS)
}
