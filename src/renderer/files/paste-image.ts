import type { AppContext } from '../context'
import type { EditorApi } from '../editor/editor-api'
import type { TabManager } from '../tabs/tab-manager'

interface PasteOpts {
  ctx: AppContext
  editor: EditorApi
  tabs: TabManager
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

export function attachImagePaste(opts: PasteOpts): () => void {
  const handler = async (evt: ClipboardEvent): Promise<void> => {
    if (!evt.clipboardData) return
    const items = Array.from(evt.clipboardData.items)
    const image = items.find((i) => IMG_PREFIX_RE.test(i.type))
    if (!image) return
    const blob = image.getAsFile()
    if (!blob) return

    evt.preventDefault()
    const active = opts.tabs.getActive()
    const baseDir = active?.filePath
      ? active.filePath.replace(/[\\/][^\\/]*$/, '')
      : null
    const imageDir = (await opts.ctx.api.storeGet('imageSaveDir')) ?? 'assets'

    const fileName = generateFileName(blob.type)
    const dataBase64 = await blobToBase64(blob)

    const result = await opts.ctx.api.imageSave({
      baseDir,
      fileName,
      dataBase64,
      imageDir,
    })

    if (!result.success) {
      console.error('[paste-image] save failed:', result.error)
      return
    }
    opts.editor.insertText(`![](${result.relPath})`)
  }

  const target = opts.ctx.dom.editorContainer
  target?.addEventListener('paste', handler)
  return () => target?.removeEventListener('paste', handler)
}
