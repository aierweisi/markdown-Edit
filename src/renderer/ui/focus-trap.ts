const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Confine Tab / Shift+Tab focus to the topmost open `.modal-overlay` so keyboard
 * users can't tab out behind a modal. Installed once at app init; no-op when no
 * modal is open. Covers every modal that uses `.modal-overlay.open`.
 */
export function installModalFocusTrap(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return
    const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay.open')
    if (overlays.length === 0) return
    const overlay = overlays[overlays.length - 1]
    const focusable = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey) {
      if (active === first || !overlay.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else if (active === last || !overlay.contains(active)) {
      e.preventDefault()
      first.focus()
    }
  }
  document.addEventListener('keydown', onKey, true)
  return () => document.removeEventListener('keydown', onKey, true)
}
