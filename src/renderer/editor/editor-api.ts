import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { buildBaseExtensions, buildGutter, gutterCompartment, themeCompartment, typewriterCompartment, typewriterExt } from './extensions'
import { lightTheme } from './theme-light'
import { darkTheme } from './theme-dark'
import { applyFormat, insertTableBlock, type FormatAction } from './format-insert'
import type { Theme } from '@shared/types'

export interface EditorApi {
  readonly view: EditorView
  getValue(): string
  focus(): void
  blur(): void
  isFocused(): boolean
  /** Switch the editor to tab `tabId`: saves the outgoing tab's EditorState
   *  (so its undo history survives the switch) and restores the incoming tab's
   *  cached state — or builds a fresh one from `text` if it has none. Pass
   *  `null` to clear the editor (no tabs left). No-op if already on that tab. */
  openTab(tabId: string | null, text: string): void
  /** Replace the ACTIVE tab's document with a fresh state (empty undo history).
   *  Use when the content is replaced wholesale from an external source (disk
   *  reload, template apply) and the prior history no longer applies. */
  swapDoc(text: string): void
  /** Drop the cached state for a tab that was closed (frees its history). */
  closeTab(tabId: string): void
  setTheme(theme: Theme): void
  setGutter(lineNumbers: boolean, folding: boolean): void
  setTypewriter(on: boolean): void
  insertFormat(action: FormatAction): void
  insertTable(rows: number, cols: number): void
  insertText(text: string): void
  getScrollTop(): number
  setScrollTop(n: number): void
  /** Scroll editor to the given 1-based line and put the cursor at its start. */
  jumpToLine(line: number): void
  replaceLine(line: number, text: string): void
  onChange(cb: (value: string) => void): () => void
  onCursorChange(cb: (info: { line: number; col: number; selection: number }) => void): () => void
  destroy(): void
}

interface CreateEditorOpts {
  parent: HTMLElement
  theme: Theme
  initialValue?: string
  extraExtensions?: Extension[]
  lineNumbers?: boolean
  folding?: boolean
}

function themeExt(theme: Theme): Extension {
  return theme === 'dark' ? darkTheme : lightTheme
}

export function createEditor(opts: CreateEditorOpts): EditorApi {
  const changeListeners = new Set<(value: string) => void>()
  const cursorListeners = new Set<
    (info: { line: number; col: number; selection: number }) => void
  >()
  // setState (used by openTab/swapDoc) would otherwise be seen as a doc change
  // and fire onChange → markModified for the freshly-loaded tab. Guarded so
  // programmatic document swaps never look like user edits.
  let suppressChange = false

  // Track the runtime-reconfigurable facets so a freshly-built EditorState (on
  // tab switch / reload) starts with the current theme/gutter/typewriter rather
  // than the defaults — setState replaces the whole state, compartments included.
  let curTheme = opts.theme
  let curLineNumbers = opts.lineNumbers ?? true
  let curFolding = opts.folding ?? true
  let curTypewriter = false

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && !suppressChange) {
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

  const buildExtensions = (): Extension[] => [
    ...buildBaseExtensions({
      theme: themeExt(curTheme),
      lineNumbers: curLineNumbers,
      folding: curFolding,
      typewriter: curTypewriter,
    }),
    updateListener,
    ...(opts.extraExtensions ?? []),
  ]

  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: opts.initialValue ?? '',
      extensions: buildExtensions(),
    }),
  })

  // Per-tab EditorState cache (undo history lives in the state). The single
  // view swaps states on tab switch instead of dispatching a full-doc replace —
  // that dispatch used to push "switch" transactions into the shared undo stack,
  // so Ctrl+Z after switching back reverted the swap and showed the other tab.
  let curTabId: string | null = null
  const docStates = new Map<string, EditorState>()

  const api: EditorApi = {
    view,
    getValue: () => view.state.doc.toString(),
    focus: () => view.focus(),
    blur: () => view.contentDOM.blur(),
    isFocused: () => view.hasFocus,
    openTab(tabId, text) {
      if (tabId !== null && tabId === curTabId) return // already showing this tab
      // Cache the outgoing tab's full state so its undo history survives.
      if (curTabId !== null && curTabId !== tabId) docStates.set(curTabId, view.state)
      curTabId = tabId
      suppressChange = true
      try {
        const saved = tabId === null ? undefined : docStates.get(tabId)
        view.setState(saved ?? EditorState.create({ doc: text, extensions: buildExtensions() }))
      } finally {
        suppressChange = false
      }
    },
    swapDoc(text) {
      // Fresh state for the active tab; drop any cached state so a later
      // openTab for this tab doesn't restore the pre-swap document.
      if (curTabId !== null) docStates.delete(curTabId)
      suppressChange = true
      try {
        view.setState(EditorState.create({ doc: text, extensions: buildExtensions() }))
      } finally {
        suppressChange = false
      }
    },
    closeTab(tabId) {
      docStates.delete(tabId)
      if (curTabId === tabId) curTabId = null
    },
    setTheme(theme) {
      curTheme = theme
      view.dispatch({ effects: themeCompartment.reconfigure(themeExt(theme)) })
    },
    setGutter(lineNumbers, folding) {
      curLineNumbers = lineNumbers
      curFolding = folding
      view.dispatch({ effects: gutterCompartment.reconfigure(buildGutter(lineNumbers, folding)) })
    },
    setTypewriter(on) {
      curTypewriter = on
      view.dispatch({ effects: typewriterCompartment.reconfigure(typewriterExt(on)) })
    },
    insertFormat(action) {
      applyFormat(view, action)
      view.focus()
    },
    insertTable(rows, cols) {
      insertTableBlock(view, rows, cols)
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
    replaceLine(line, text) {
      const doc = view.state.doc
      const ln = doc.line(Math.min(Math.max(1, line), doc.lines))
      view.dispatch({ changes: { from: ln.from, to: ln.to, insert: text } })
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
