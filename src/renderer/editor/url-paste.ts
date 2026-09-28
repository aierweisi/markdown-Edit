import { EditorView } from '@codemirror/view'

const URL_RE = /^https?:\/\/\S+$/i

/**
 * Pasting an http(s) URL over a single-line selection wraps it as a markdown
 * link: `[selected text](url)`. Everything else (no selection, multi-line
 * selection, non-URL clipboard) falls through to CodeMirror's normal paste.
 */
export const urlPaste = EditorView.domEventHandlers({
  paste(event: ClipboardEvent, view: EditorView): boolean {
    const text = (event.clipboardData?.getData('text/plain') ?? '').trim()
    if (!URL_RE.test(text)) return false
    const range = view.state.selection.main
    if (range.empty) return false
    const selected = view.state.sliceDoc(range.from, range.to)
    if (selected.includes('\n')) return false
    event.preventDefault()
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `[${selected}](${text})` },
    })
    return true
  },
})
