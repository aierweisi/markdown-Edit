import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import { blobToBase64 } from '../files/paste-image'
import { showToast } from '../ui/toast'

interface MermaidExportDeps {
  ctx: AppContext
  tabs: TabManager
}

/**
 * Right-click a rendered mermaid diagram → export as SVG (save dialog) or
 * PNG (rasterized at 2x, saved next to the active document). Attached to the
 * preview body with delegation, like the other preview interactions.
 */
export function attachMermaidExport(host: HTMLElement, deps: MermaidExportDeps): () => void {
  let menuEl: HTMLElement | null = null
  let outsideDown: ((e: MouseEvent) => void) | null = null

  function closeMenu(): void {
    if (outsideDown) {
      document.removeEventListener('mousedown', outsideDown)
      outsideDown = null
    }
    menuEl?.remove()
    menuEl = null
  }

  function activeBaseDir(): string | null {
    const fp = deps.tabs.getActive()?.filePath
    return fp ? fp.replace(/[\\/][^\\/]*$/, '') : null
  }

  const onContextMenu = (evt: MouseEvent): void => {
    closeMenu()
    const wrap = (evt.target as HTMLElement).closest<HTMLElement>('.mermaid-block')
    if (!wrap || !wrap.querySelector('svg')) return
    evt.preventDefault()

    menuEl = document.createElement('div')
    menuEl.className = 'context-menu'
    const items: Array<{ label: string; run: () => void }> = [
      { label: '导出 SVG', run: () => void exportSvg(wrap) },
      { label: '导出 PNG（2x）', run: () => void exportPng(wrap) },
    ]
    for (const it of items) {
      const b = document.createElement('div')
      b.className = 'context-menu-item'
      b.textContent = it.label
      b.addEventListener('click', () => {
        closeMenu()
        it.run()
      })
      menuEl!.appendChild(b)
    }
    menuEl.style.left = `${Math.min(evt.clientX, window.innerWidth - 180)}px`
    menuEl.style.top = `${evt.clientY}px`
    document.body.appendChild(menuEl)
    outsideDown = (e: MouseEvent): void => {
      if (menuEl && !menuEl.contains(e.target as Node)) closeMenu()
    }
    setTimeout(() => {
      if (outsideDown) document.addEventListener('mousedown', outsideDown)
    }, 0)
  }

  host.addEventListener('contextmenu', onContextMenu)
  return () => {
    host.removeEventListener('contextmenu', onContextMenu)
    closeMenu()
  }

  // ── export paths ────────────────────────────────────────────────────
  function stamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z$', '')
  }

  function svgSource(wrap: HTMLElement): { xml: string; width: number; height: number } | null {
    const svg = wrap.querySelector('svg')
    if (!svg) return null
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
    const rect = svg.getBoundingClientRect()
    const vb = svg.viewBox?.baseVal
    const width = Math.ceil(rect.width || vb?.width || 800)
    const height = Math.ceil(rect.height || vb?.height || 600)
    // Explicit dimensions: standalone viewers (and our canvas draw) size from
    // these, not from CSS.
    clone.setAttribute('width', String(width))
    clone.setAttribute('height', String(height))
    return { xml: new XMLSerializer().serializeToString(clone), width, height }
  }

  async function exportSvg(wrap: HTMLElement): Promise<void> {
    const src = svgSource(wrap)
    if (!src) {
      showToast('无法读取图表', 'error')
      return
    }
    const dialog = await deps.ctx.api.dialogSaveFile({
      defaultPath: `diagram-${stamp()}.svg`,
      filters: [{ name: 'SVG', extensions: ['svg'] }],
    })
    if (dialog.canceled || !dialog.filePath) return
    const res = await deps.ctx.api.fileSave(dialog.filePath, src.xml, true)
    if (!res.success) {
      showToast(`导出失败: ${res.error}`, 'error')
      return
    }
    showToast('已导出 SVG', 'success')
  }

  async function exportPng(wrap: HTMLElement): Promise<void> {
    const src = svgSource(wrap)
    if (!src) {
      showToast('无法读取图表', 'error')
      return
    }
    const baseDir = activeBaseDir()
    if (!baseDir) {
      showToast('请先保存文档，再导出图表', 'info')
      return
    }
    const svgUrl = URL.createObjectURL(new Blob([src.xml], { type: 'image/svg+xml;charset=utf-8' }))
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('SVG 光栅化失败'))
        i.src = svgUrl
      })
      const canvas = document.createElement('canvas')
      canvas.width = src.width * 2
      canvas.height = src.height * 2
      const c2d = canvas.getContext('2d')
      if (!c2d) throw new Error('canvas 不可用')
      // Mermaid text is dark-on-light; fill a background so dark-theme exports
      // don't come out inverted-transparent.
      c2d.fillStyle = '#ffffff'
      c2d.fillRect(0, 0, canvas.width, canvas.height)
      c2d.drawImage(img, 0, 0, canvas.width, canvas.height)
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!png) throw new Error('PNG 编码失败')
      const fileName = `diagram-${stamp()}.png`
      const res = await deps.ctx.api.imageSave({
        baseDir,
        fileName,
        dataBase64: await blobToBase64(png),
        imageDir: '.',
      })
      if (!res.success) {
        showToast(`导出失败: ${res.error}`, 'error')
        return
      }
      showToast('已导出 PNG', 'success')
    } catch (err) {
      showToast(`导出失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }
}
