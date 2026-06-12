import { app, ipcMain } from 'electron'
import { promises as fsp, existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, join, basename, extname, relative as pathRelative, resolve as pathResolve } from 'node:path'
import { CH, ImageSaveReqSchema, type ImageSaveResp } from '@shared/ipc'
import { isPathSafe } from '../security/isPathSafe'

// PNG / JPEG / GIF / WEBP / BMP magic byte signatures.
function isSupportedImage(buf: Buffer): boolean {
  if (buf.length < 12) return false
  const [b0, b1, b2, b3] = [buf[0], buf[1], buf[2], buf[3]]
  // PNG: 89 50 4E 47
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return true
  // JPEG: FF D8 FF
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return true
  // GIF: 47 49 46
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return true
  // WEBP: 52 49 46 46 ... 57 45 42 50
  if (
    b0 === 0x52 &&
    b1 === 0x49 &&
    b2 === 0x46 &&
    b3 === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true
  }
  // BMP: 42 4D
  if (b0 === 0x42 && b1 === 0x4d) return true
  return false
}

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/\.\./g, '').replace(/^\.+/, '') || 'image.png'
}

export function registerImageIpc(): void {
  ipcMain.handle(CH.IMAGE_SAVE, async (_event, raw: unknown): Promise<ImageSaveResp> => {
    const parsed = ImageSaveReqSchema.safeParse(raw)
    if (!parsed.success) return { success: false, error: 'invalid request' }
    const { baseDir, fileName, dataBase64, imageDir } = parsed.data

    const rawDir = imageDir.trim() || 'assets'
    if (isAbsolute(rawDir)) {
      if (!isPathSafe(rawDir)) return { success: false, error: 'invalid imageDir path' }
    } else if (rawDir.includes('..')) {
      return { success: false, error: 'invalid imageDir path' }
    }

    const saveDir = isAbsolute(rawDir)
      ? rawDir
      : baseDir
        ? join(pathResolve(baseDir), rawDir)
        : join(app.getPath('userData'), 'pasted-images')

    if (!existsSync(saveDir)) mkdirSync(saveDir, { recursive: true })

    let safeName = sanitizeFileName(fileName)
    let fullPath = join(saveDir, safeName)
    let counter = 1
    while (existsSync(fullPath)) {
      const ext = extname(safeName)
      const base = basename(safeName, ext)
      safeName = `${base}-${counter}${ext}`
      fullPath = join(saveDir, safeName)
      counter++
      if (counter > 9999) return { success: false, error: 'too many duplicates' }
    }

    if (!isPathSafe(fullPath)) return { success: false, error: 'invalid final path' }

    const buf = Buffer.from(dataBase64, 'base64')
    if (!isSupportedImage(buf)) return { success: false, error: 'invalid image data' }

    try {
      await fsp.writeFile(fullPath, buf)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    return {
      success: true,
      relPath:
        !isAbsolute(rawDir) && baseDir
          ? pathRelative(baseDir, fullPath).replace(/\\/g, '/')
          : 'file:///' + fullPath.replace(/\\/g, '/'),
      absPath: fullPath,
    }
  })
}
