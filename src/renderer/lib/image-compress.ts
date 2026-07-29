export interface CompressOptions {
  /** Max length of the longest edge, in px. */
  maxSize: number
  /** JPEG/WebP encode quality, 0–1. */
  quality: number
}

export interface CompressResult {
  blob: Blob
  type: string
}

/**
 * Downscale + re-encode a pasted image to keep screenshots small on disk.
 *  - Longest edge over `maxSize` → proportional downscale.
 *  - No transparency → re-encode as JPEG at `quality` (far smaller for photos).
 *    Transparent images stay PNG (JPEG can't hold alpha).
 *  - Falls back to the original blob on any failure so pasting never breaks.
 *  - Only uses the compressed result when it is actually smaller than the input.
 */
export async function compressImage(blob: Blob, opts: CompressOptions): Promise<CompressResult> {
  if (!blob.type.startsWith('image/')) return { blob, type: blob.type }
  try {
    const bitmap = await createImageBitmap(blob)
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = longest > opts.maxSize ? opts.maxSize / longest : 1
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob, type: blob.type }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const hasAlpha = detectTransparency(ctx, w, h)
    const mime = hasAlpha ? 'image/png' : 'image/jpeg'

    const out = await canvasToBlob(canvas, mime, opts.quality)
    if (!out) return { blob, type: blob.type }
    return out.size < blob.size ? { blob: out, type: mime } : { blob, type: blob.type }
  } catch {
    return { blob, type: blob.type }
  }
}

/**
 * Scan alpha channel for any non-opaque pixel. Skipped for very large canvases
 * to avoid OOM (conservatively assumes transparency then → keeps PNG).
 */
function detectTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  if (w * h > 4_000_000) return true
  try {
    const { data } = ctx.getImageData(0, 0, w, h)
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true
    }
    return false
  } catch {
    return true
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality))
}
