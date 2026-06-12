import type { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'

export type FormatAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'image'
  | 'codeblock'
  | 'quote'
  | 'table'
  | 'ul'
  | 'ol'
  | 'hr'
  | 'heading'

const WRAP: Partial<Record<FormatAction, { left: string; right: string; placeholder: string }>> = {
  bold: { left: '**', right: '**', placeholder: '粗体文字' },
  italic: { left: '*', right: '*', placeholder: '斜体文字' },
  strikethrough: { left: '~~', right: '~~', placeholder: '删除线文字' },
  code: { left: '`', right: '`', placeholder: 'code' },
}

const TABLE_SNIPPET = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容1 | 内容2 | 内容3 |'

function wrapSelection(view: EditorView, left: string, right: string, placeholder: string): void {
  const { state } = view
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to)
    const insert = `${left}${text || placeholder}${right}`
    return {
      changes: { from: range.from, to: range.to, insert },
      range: text
        ? EditorSelection.range(range.from + left.length, range.from + left.length + text.length)
        : EditorSelection.range(
            range.from + left.length,
            range.from + left.length + placeholder.length,
          ),
    }
  })
  view.dispatch(changes)
}

function insertAtLineStart(view: EditorView, prefix: string): void {
  const { state } = view
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from)
    const lineText = state.sliceDoc(line.from, line.to)
    if (lineText.startsWith(prefix)) {
      return {
        changes: { from: line.from, to: line.from + prefix.length, insert: '' },
        range: EditorSelection.range(range.from - prefix.length, range.to - prefix.length),
      }
    }
    return {
      changes: { from: line.from, to: line.from, insert: prefix },
      range: EditorSelection.range(range.from + prefix.length, range.to + prefix.length),
    }
  })
  view.dispatch(changes)
}

function insertBlock(view: EditorView, text: string, selectionOffset?: [number, number]): void {
  const { state } = view
  const range = state.selection.main
  const needsLeadingNl = range.from > 0 && state.sliceDoc(range.from - 1, range.from) !== '\n'
  const insert = (needsLeadingNl ? '\n' : '') + text
  const newPos = range.from + insert.length
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: selectionOffset
      ? EditorSelection.single(
          range.from + insert.length + selectionOffset[0] - text.length,
          range.from + insert.length + selectionOffset[1] - text.length,
        )
      : EditorSelection.single(newPos),
  })
}

function cycleHeading(view: EditorView): void {
  const { state } = view
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from)
    const text = state.sliceDoc(line.from, line.to)
    const match = text.match(/^(#{1,6})\s/)
    let next: string
    if (!match) next = '# ' + text
    else if (match[1].length === 1) next = '## ' + text.slice(match[0].length)
    else if (match[1].length === 2) next = '### ' + text.slice(match[0].length)
    else next = text.slice(match[0].length)
    return {
      changes: { from: line.from, to: line.to, insert: next },
      range: EditorSelection.cursor(line.from + next.length),
    }
  })
  view.dispatch(changes)
}

export function applyFormat(view: EditorView, action: FormatAction): void {
  const wrap = WRAP[action]
  if (wrap) {
    wrapSelection(view, wrap.left, wrap.right, wrap.placeholder)
    return
  }

  switch (action) {
    case 'heading':
      cycleHeading(view)
      return
    case 'link': {
      const { state } = view
      const range = state.selection.main
      const text = state.sliceDoc(range.from, range.to) || '链接文字'
      const insert = `[${text}](https://)`
      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.range(
          range.from + insert.length - 1,
          range.from + insert.length - 1,
        ),
      })
      return
    }
    case 'image': {
      const { state } = view
      const range = state.selection.main
      const text = state.sliceDoc(range.from, range.to) || '图片描述'
      const insert = `![${text}](https://)`
      view.dispatch({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.range(
          range.from + insert.length - 1,
          range.from + insert.length - 1,
        ),
      })
      return
    }
    case 'codeblock':
      insertBlock(view, '```\n\n```\n', [4, 4])
      return
    case 'quote':
      insertAtLineStart(view, '> ')
      return
    case 'ul':
      insertAtLineStart(view, '- ')
      return
    case 'ol':
      insertAtLineStart(view, '1. ')
      return
    case 'hr':
      insertBlock(view, '---\n')
      return
    case 'table':
      insertBlock(view, TABLE_SNIPPET + '\n')
      return
  }
}
