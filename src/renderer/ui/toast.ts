type ToastKind = 'info' | 'success' | 'error'

const ACTIVE_TIMEOUT_MS = 2500

export function showToast(message: string, kind: ToastKind = 'info'): void {
  let host = document.getElementById('toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'toast-host'
    document.body.appendChild(host)
  }
  const toast = document.createElement('div')
  toast.className = `toast toast--${kind}`
  toast.textContent = message
  host.appendChild(toast)
  setTimeout(() => {
    toast.classList.add('toast--leaving')
    setTimeout(() => toast.remove(), 220)
  }, ACTIVE_TIMEOUT_MS)
}
