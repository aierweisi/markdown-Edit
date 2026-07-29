import { keymap, EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import {
  cellRanges,
  cellIndexAt,
  cellContentPos,
  findTableRange,
  isSeparatorRow,
} from './table-parser'

/**
 * Tab / Shift-Tab inside a GFM table → move between cells (appending a new row
 * when moving forward past the last cell). Outside a table → return false so
 * the default `indentWithTab` still handles indentation.
 */
export const tableKeymap = keymap.of([
  { key: 'Tab', preventDefault: true, run: (v) => moveCell(v, true) },
  { key: 'Shift-Tab', preventDefault: true, run: (v) => moveCell(v, false) },
])

function moveCell(view: EditorView, forward: boolean): boolean {
  const { state } = view
  const head = state.selection.main.head
  const lineObj = state.doc.lineAt(head)
  const lineIdx = lineObj.number - 1
  const lines = state.doc.toString().split('\n')
  const range = findTableRange(lines, lineIdx)
  if (!range) return false

  const text = lines[lineIdx]!
  const cells = cellRanges(text)
  const col = cellIndexAt(text, head - lineObj.from, cells)
  if (col < 0) return false

  // 1) move within the same row
  const nextCol = forward ? col + 1 : col - 1
  if (nextCol >= 0 && nextCol < cells.length) {
    setCursor(view, lineObj.from + cellContentPos(text, cells[nextCol]!))
    return true
  }

  // 2) move to the neighbouring data row (skip separator), first/last cell
  const dir = forward ? 1 : -1
  for (let li = lineIdx + dir; li >= range.fromLine && li <= range.toLine; li += dir) {
    if (isSeparatorRow(lines[li]!)) continue
    const rtext = lines[li]!
    const rcells = cellRanges(rtext)
    if (rcells.length === 0) continue
    const targetCol = forward ? 0 : rcells.length - 1
    setCursor(view, state.doc.line(li + 1).from + cellContentPos(rtext, rcells[targetCol]!))
    return true
  }

  // 3) forward past the last cell → append an empty row sized like the table
  if (forward) {
    appendTableRow(view, range, cells.length)
    return true
  }
  return false
}

function setCursor(view: EditorView, pos: number): void {
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    effects: EditorView.scrollIntoView(pos, { y: 'nearest' }),
  })
}

function appendTableRow(
  view: EditorView,
  range: { fromLine: number; toLine: number },
  colCount: number,
): void {
  const { state } = view
  const lastLine = state.doc.line(range.toLine + 1)
  const row = '|' + Array.from({ length: colCount }, () => '   ').join('|') + '|'
  const insert = '\n' + row
  // land the cursor inside the first new cell (past '\n' and the leading '|')
  const firstCellPos = lastLine.to + 2
  view.dispatch({
    changes: { from: lastLine.to, to: lastLine.to, insert },
    selection: EditorSelection.cursor(firstCellPos),
  })
}
