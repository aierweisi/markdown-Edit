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
import { formatKeymap } from './format-keymap'

/** Holds the theme compartment so callers can swap light↔dark at runtime. */
export const themeCompartment = new Compartment()

/** Holds the language compartment (kept stable in case future formats are added). */
export const langCompartment = new Compartment()

/** Chinese localization for the built-in CodeMirror search/replace panel. */
const cmZhPhrases = EditorState.phrases.of({
  Find: '查找',
  Replace: '替换',
  next: '下一个',
  previous: '上一个',
  all: '全选',
  'match case': '区分大小写',
  regexp: '正则',
  'by word': '全字匹配',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭',
  'current match': '当前匹配',
  'on line': '于行',
  'replaced match on line $': '已替换第 $ 行的匹配',
  'replaced $ matches': '已替换 $ 处匹配',
  'Go to line': '跳转到行',
  go: '跳转',
})

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
    cmZhPhrases,
    continueListKeymap,
    formatKeymap,
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
  ]
}
