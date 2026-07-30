import type { AppContext } from '../context'
import type { EditorApi } from '../editor/editor-api'
import type { TabManager } from '../tabs/tab-manager'
import { compressImage, type CompressOptions } from '../lib/image-compress'

export interface PasteOpts {
  ctx: AppContext
  editor: EditorApi
  tabs: TabManager
}

/** Save an image blob to the active file's dir (honoring compress settings) and
 *  insert a markdown image reference at the cursor. Returns false on save failure. */
export async function insertImageBlob(blob: Blob, opts: PasteOpts): Promise<boolean> {
  const active = opts.tabs.getActive()
  const baseDir = active?.filePath
    ? active.filePath.replace(/[\\/][^\\/]*$/, '')
    : null
  const imageDir = (await opts.ctx.api.storeGet('imageSaveDir')) ?? 'assets'
  const cfg = await loadCompressConfig(opts.ctx)
  const out = cfg.enabled ? await compressImage(blob, cfg) : { blob, type: blob.type }
  const fileName = generateFileName(out.type)
  const dataBase64 = await blobToBase64(out.blob)
  const result = await opts.ctx.api.imageSave({ baseDir, fileName, dataBase64, imageDir })
  if (!result.success) {
    console.error('[image] save failed:', result.error)
    return false
  }
  opts.editor.insertText(`![](${result.relPath})`)
  return true
}

const IMG_PREFIX_RE = /^image\//

function generateFileName(mime: string): string {
  const ext = mime.split('/')[1] || 'png'
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/T/, '_')
    .replace(/Z$/, '')
  return `paste-${ts}.${ext}`
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function loadCompressConfig(ctx: AppContext): Promise<{ enabled: boolean } & CompressOptions> {
  const [enabled, maxSize, quality] = await Promise.all([
    ctx.api.storeGet('imageCompressEnabled'),
    ctx.api.storeGet('imageCompressMaxSize'),
    ctx.api.storeGet('imageCompressQuality'),
  ])
  return {
    enabled: enabled ?? true,
    maxSize: maxSize ?? 1920,
    quality: quality ?? 0.85,
  }
}

export function attachImagePaste(opts: PasteOpts): () => void {
  const handler = async (evt: ClipboardEvent): Promise<void> => {
    if (!evt.clipboardData) return
    const items = Array.from(evt.clipboardData.items)
    const image = items.find((i) => IMG_PREFIX_RE.test(i.type))
    if (!image) return
    const blob = image.getAsFile()
    if (!blob) return
    evt.preventDefault()
    await insertImageBlob(blob, opts)
  }

  const target = opts.ctx.dom.editorContainer
  target?.addEventListener('paste', handler)
  return () => target?.removeEventListener('paste', handler)
}
