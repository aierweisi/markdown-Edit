// Minimal lightbox for clicking preview images. Phase-7 stripped-down vs the
// old 200-line implementation; supports click-to-open, ESC-to-close, click
// outside to close. (Zoom/drag deferred — can be added later if needed.)

export function attachImageLightbox(host: HTMLElement): () => void {
  function onClick(evt: MouseEvent): void {
    const target = evt.target as HTMLElement
    if (target.tagName !== 'IMG') return
    if (target.closest('.no-lightbox')) return
    openLightbox((target as HTMLImageElement).src)
  }

  host.addEventListener('click', onClick)
  return () => host.removeEventListener('click', onClick)
}

function openLightbox(src: string): void {
  const overlay = document.createElement('div')
  overlay.className = 'lightbox'
  // Build the <img> via the DOM (not innerHTML) so the browser normalizes src
  // and refuses dangerous schemes — no attribute-context string interpolation.
  const img = document.createElement('img')
  img.className = 'lightbox__image'
  img.alt = ''
  img.src = src
  overlay.appendChild(img)
  document.body.appendChild(overlay)

  function close(): void {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  function onKey(evt: KeyboardEvent): void {
    if (evt.key === 'Escape') close()
  }
  overlay.addEventListener('click', close)
  document.addEventListener('keydown', onKey)
}
