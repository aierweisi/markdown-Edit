import type { EditorApi } from '../editor/editor-api'

interface SyncScrollOpts {
  editor: EditorApi
  previewContainer: HTMLElement
}

interface Anchor {
  /** 1-based source line of the heading. */
  line: number
  /** Pixel offset of the heading within the preview's scrollable content. */
  top: number
}

/**
 * Anchor-based bidirectional scroll sync between editor and preview.
 *
 * A whole-document ratio mapping drifts badly on image/code-heavy documents
 * (one tall preview image shifts everything below it). Instead, both panes
 * are segmented by shared anchors — the preview's `data-line`-tagged
 * headings, stamped by the render pipeline (tagHeadingLines) — and position
 * is mapped proportionally *within* the segment containing the viewport top.
 * When stamping was skipped (heading-count mismatch) or the document has no
 * headings, we degrade to plain ratio mapping.
 *
 * A short-lived directional lock absorbs the echo of our own programmatic
 * scrolling (and scrollTop clamps after a preview re-render) so the panes
 * can't ping-pong: scroll events arriving from the pane we just moved are
 * ignored for the lock window.
 */
export function attachSyncScroll(opts: SyncScrollOpts): () => void {
  const editorEl = opts.editor.view.scrollDOM
  const previewEl = opts.previewContainer

  let lock: 'editor' | 'preview' | null = null
  let lockTimer: ReturnType<typeof setTimeout> | null = null
  function grab(side: 'editor' | 'preview'): void {
    lock = side
    if (lockTimer != null) clearTimeout(lockTimer)
    lockTimer = setTimeout(() => {
      lock = null
      lockTimer = null
    }, 120)
  }

  /** Live heading anchors (measured per event — heights change on re-render). */
  function previewAnchors(): Anchor[] {
    const out: Anchor[] = []
    const base = previewEl.getBoundingClientRect()
    for (const h of previewEl.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')) {
      const line = parseInt(h.dataset.line ?? '', 10)
      if (!Number.isFinite(line) || line < 1) continue
      out.push({ line, top: h.getBoundingClientRect().top - base.top + previewEl.scrollTop })
    }
    // querySelectorAll yields document order = source order; re-assert sorted
    // so the section search below can't be fooled by exotic DOM reordering.
    out.sort((a, b) => a.line - b.line)
    // Implicit anchor for the content above the first heading (title/intro).
    if (out.length === 0 || out[0]!.line > 1 || out[0]!.top > 0) out.unshift({ line: 1, top: 0 })
    return out
  }

  /** scrollTop for `progress` (0..1) through the section [from, to]; the last
   *  section stretches to the end of the scrollable content. */
  function sectionScroll(from: number, to: number | undefined, progress: number, maxScroll: number): number {
    const end = to ?? maxScroll
    return Math.max(0, Math.min(maxScroll, from + progress * (end - from)))
  }

  function onEditor(): void {
    if (lock === 'preview') return
    grab('editor')
    const view = opts.editor.view
    const maxP = Math.max(1, previewEl.scrollHeight - previewEl.clientHeight)
    const anchors = previewAnchors()
    if (anchors.length === 0) {
      previewEl.scrollTop =
        (editorEl.scrollTop / Math.max(1, editorEl.scrollHeight - editorEl.clientHeight)) * maxP
      return
    }
    // Topmost visible source line (first continuous visible range).
    const from = view.visibleRanges.length > 0 ? view.visibleRanges[0]!.from : 0
    const topLine = view.state.doc.lineAt(from).number
    let i = 0
    while (i + 1 < anchors.length && anchors[i + 1]!.line <= topLine) i++
    const a = anchors[i]!
    const next = anchors[i + 1]
    const nextLine = next?.line ?? view.state.doc.lines + 1
    const progress = Math.max(0, Math.min(1, (topLine - a.line) / Math.max(1, nextLine - a.line)))
    previewEl.scrollTop = sectionScroll(a.top, next?.top, progress, maxP)
  }

  function onPreview(): void {
    if (lock === 'editor') return
    grab('preview')
    const view = opts.editor.view
    const maxE = Math.max(1, editorEl.scrollHeight - editorEl.clientHeight)
    const anchors = previewAnchors()
    if (anchors.length === 0) {
      editorEl.scrollTop =
        (previewEl.scrollTop / Math.max(1, previewEl.scrollHeight - previewEl.clientHeight)) * maxE
      return
    }
    const top = previewEl.scrollTop
    let i = 0
    while (i + 1 < anchors.length && anchors[i + 1]!.top <= top + 1) i++
    const a = anchors[i]!
    const next = anchors[i + 1]
    const nextTop = next?.top ?? Math.max(a.top, previewEl.scrollHeight - previewEl.clientHeight)
    const progress = Math.max(0, Math.min(1, (top - a.top) / Math.max(1, nextTop - a.top)))
    const nextLine = next?.line ?? view.state.doc.lines + 1
    const targetLine = Math.max(1, Math.min(view.state.doc.lines, Math.round(a.line + progress * (nextLine - a.line))))
    // lineBlockAt reports content coordinates — the same space scrollTop lives in.
    const blockTop = view.lineBlockAt(view.state.doc.line(targetLine).from).top
    editorEl.scrollTop = Math.max(0, Math.min(maxE, blockTop))
  }

  editorEl.addEventListener('scroll', onEditor, { passive: true })
  previewEl.addEventListener('scroll', onPreview, { passive: true })

  return () => {
    if (lockTimer != null) clearTimeout(lockTimer)
    editorEl.removeEventListener('scroll', onEditor)
    previewEl.removeEventListener('scroll', onPreview)
  }
}
