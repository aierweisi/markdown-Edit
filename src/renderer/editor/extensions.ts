import { EditorState, Compartment, type Extension } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  placeholder as placeholderExt,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { searchKeymap } from '@codemirror/search'
import { continueList } from '../lib/markdown-inline'

/** Holds the theme compartment so callers can swap light↔dark at runtime. */
export const themeCompartment = new Compartment()

/** Holds the language compartment (kept stable in case future formats are added). */
export const langCompartment = new Compartment()

const continueListKeymap = keymap.of([
  {
    key: 'Enter',
    run(view): boolean {
      const { state } = view
      const range = state.selection.main
      const line = state.doc.lineAt(range.head)
      const continuation = continueList(line.text)
      if (!continuation) return false
      if (continuation.emptyDeletion) {
        // empty list marker — clear the line
        view.dispatch({
          changes: { from: line.from, to: range.head, insert: '' },
          selection: { anchor: line.from },
        })
        return true
      }
      const insert = '\n' + continuation.prefix
      view.dispatch({
        changes: { from: range.head, to: range.head, insert },
        selection: { anchor: range.head + insert.length },
      })
      return true
    },
  },
])

export interface BaseExtensionsOpts {
  placeholder?: string
  theme: Extension
}

export function buildBaseExtensions(opts: BaseExtensionsOpts): Extension[] {
  return [
    history(),
    EditorState.allowMultipleSelections.of(true),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    EditorView.lineWrapping,
    placeholderExt(opts.placeholder ?? '开始写作…'),
    langCompartment.of(markdown({ base: markdownLanguage, codeLanguages: languages })),
    themeCompartment.of(opts.theme),
    continueListKeymap,
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
  ]
}
