import { describe, it, expect } from 'vitest'
import { compressImage } from '../src/renderer/lib/image-compress'

describe('compressImage', () => {
  it('passes non-image blobs through unchanged', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })
    const out = await compressImage(blob, { maxSize: 1920, quality: 0.85 })
    expect(out.blob).toBe(blob)
    expect(out.type).toBe('text/plain')
  })

  it('falls back to the original blob when the image cannot be decoded', async () => {
    // Invalid PNG bytes — createImageBitmap will throw (or be unavailable),
    // and the function must return the original blob untouched.
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'image/png' })
    const out = await compressImage(blob, { maxSize: 1920, quality: 0.85 })
    expect(out.blob).toBe(blob)
  })
})
