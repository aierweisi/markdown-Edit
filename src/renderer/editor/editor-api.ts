import { Annotation, EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { buildBaseExtensions, themeCompartment } from './extensions'
import { lightTheme } from './theme-light'
import { darkTheme } from './theme-dark'
import { applyFormat, type FormatAction } from './format-insert'
import type { Theme } from '@shared/types'

export interface EditorApi {
  readonly view: EditorView
  getValue(): string
  setValue(text: string): void
  focus(): void
  blur(): void
  isFocused(): boolean
  swapDoc(text: string): void
  setTheme(theme: Theme): void
  insertFormat(action: FormatAction): void
  insertText(text: string): void
  getScrollTop(): number
  setScrollTop(n: number): void
  /** Scroll editor to the given 1-based line and put the cursor at its start. */
  jumpToLine(line: number): void
  onChange(cb: (value: string) => void): () => void
  onCursorChange(cb: (info: { line: number; col: number; selection: number }) => void): () => void
  destroy(): void
}

interface CreateEditorOpts {
  parent: HTMLElement
  theme: Theme
  initialValue?: string
  extraExtensions?: Extension[]
}

function themeExt(theme: Theme): Extension {
  return theme === 'dark' ? darkTheme : lightTheme
}

const programmaticChange = Annotation.define<boolean>()

export function createEditor(opts: CreateEditorOpts): EditorApi {
  const changeListeners = new Set<(value: string) => void>()
  const cursorListeners = new Set<
    (info: { line: number; col: number; selection: number }) => void
  >()

  const updateListener = EditorView.updateListener.of((update) => {
    const isProgrammatic = update.transactions.some((tr) => tr.annotation(programmaticChange))
    if (update.docChanged && !isProgrammatic) {
      const value = update.state.doc.toString()
      changeListeners.forEach((fn) => fn(value))
    }
    if (update.selectionSet || update.docChanged) {
      const range = update.state.selection.main
      const line = update.state.doc.lineAt(range.head)
      cursorListeners.forEach((fn) =>
        fn({
          line: line.number,
          col: range.head - line.from + 1,
          selection: range.to - range.from,
        }),
      )
    }
  })

  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: opts.initialValue ?? '',
      extensions: [
        ...buildBaseExtensions({ theme: themeExt(opts.theme) }),
        updateListener,
        ...(opts.extraExtensions ?? []),
      ],
    }),
  })

  const api: EditorApi = {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(text) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        annotations: programmaticChange.of(true),
      })
    },
    focus: () => view.focus(),
    blur: () => view.contentDOM.blur(),
    isFocused: () => view.hasFocus,
    swapDoc(text) {
      // Replace the entire doc — note: history is preserved on the same view.
      // Phase 6's tab-manager keeps a per-tab snapshot and re-applies on switch.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0 },
        annotations: programmaticChange.of(true),
      })
    },
    setTheme(theme) {
      view.dispatch({ effects: themeCompartment.reconfigure(themeExt(theme)) })
    },
    insertFormat(action) {
      applyFormat(view, action)
      view.focus()
    },
    insertText(text) {
      const range = view.state.selection.main
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: text },
        selection: { anchor: range.from + text.length },
      })
    },
    getScrollTop: () => view.scrollDOM.scrollTop,
    setScrollTop(n) {
      view.scrollDOM.scrollTop = n
    },
    jumpToLine(line) {
      const { state } = view
      const clamped = Math.min(Math.max(1, line), state.doc.lines)
      const target = state.doc.line(clamped)
      view.dispatch({
        selection: { anchor: target.from },
        effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 32 }),
      })
      view.focus()
    },
    onChange(cb) {
      changeListeners.add(cb)
      return () => changeListeners.delete(cb)
    },
    onCursorChange(cb) {
      cursorListeners.add(cb)
      return () => cursorListeners.delete(cb)
    },
    destroy() {
      changeListeners.clear()
      cursorListeners.clear()
      view.destroy()
    },
  }

  return api
}
