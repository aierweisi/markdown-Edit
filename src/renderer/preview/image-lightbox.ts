// Lightbox for clicking preview images: ESC / click-outside to close, wheel
// to zoom (0.2–8x, cursor-anchored), double-click toggles 1x ↔ 2x. Pan by
// dragging the image; single click on the image itself (without dragging)
// also closes.

const MIN_SCALE = 0.2
const MAX_SCALE = 8

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

  let scale = 1
  let tx = 0
  let ty = 0
  let panning = false
  let moved = false
  let lastX = 0
  let lastY = 0

  function apply(): void {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
  }

  function close(): void {
    overlay.remove()
    overlay.removeEventListener('wheel', onWheel)
    document.removeEventListener('keydown', onKey)
  }
  function onKey(evt: KeyboardEvent): void {
    if (evt.key === 'Escape') close()
  }

  // Zoom anchored at the cursor: keep the image point under the pointer fixed
  // while the scale changes (standard map-style zoom).
  function onWheel(evt: WheelEvent): void {
    evt.preventDefault()
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (evt.deltaY < 0 ? 1.15 : 1 / 1.15)))
    if (next === scale) return
    const rect = img.getBoundingClientRect()
    const px = evt.clientX - (rect.left + rect.width / 2)
    const py = evt.clientY - (rect.top + rect.height / 2)
    const k = next / scale
    tx = px - k * (px - tx)
    ty = py - k * (py - ty)
    scale = next
    apply()
  }

  overlay.addEventListener('wheel', onWheel, { passive: false })
  // Double-click toggles 1x ↔ 2x, anchored at the cursor like wheel zoom.
  img.addEventListener('dblclick', (evt) => {
    evt.preventDefault()
    const next = scale === 1 ? 2 : 1
    const rect = img.getBoundingClientRect()
    const px = evt.clientX - (rect.left + rect.width / 2)
    const py = evt.clientY - (rect.top + rect.height / 2)
    const k = next / scale
    tx = px - k * (px - tx)
    ty = py - k * (py - ty)
    scale = next
    apply()
  })
  overlay.addEventListener('click', (evt) => {
    if (evt.target === img && moved) return // ignore the click ending a drag
    close()
  })
  document.addEventListener('keydown', onKey)

  // Drag to pan (only meaningful when zoomed, but harmless otherwise).
  img.addEventListener('pointerdown', (evt) => {
    panning = true
    moved = false
    lastX = evt.clientX
    lastY = evt.clientY
    try {
      img.setPointerCapture(evt.pointerId)
    } catch {
      /* capture unavailable */
    }
    evt.preventDefault()
  })
  img.addEventListener('pointermove', (evt) => {
    if (!panning) return
    const dx = evt.clientX - lastX
    const dy = evt.clientY - lastY
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true
    tx += dx
    ty += dy
    lastX = evt.clientX
    lastY = evt.clientY
    apply()
  })
  const stopPan = (): void => {
    panning = false
  }
  img.addEventListener('pointerup', stopPan)
  img.addEventListener('pointercancel', stopPan)
}
