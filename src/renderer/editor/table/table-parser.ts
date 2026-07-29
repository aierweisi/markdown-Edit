// Helpers for navigating GFM markdown tables in the CodeMirror editor.
// A "table row" is a line that starts (after optional leading spaces) with `|` —
// the form produced by the editor's own table snippet and the common GFM
// convention. Rows without a leading `|` are not treated as tables (Tab then
// falls through to normal indentation).

const ROW_RE = /^\s*\|/

/** Is this line a table row (leading `|`)? Includes separator rows. */
export function isTableRow(text: string): boolean {
  return ROW_RE.test(text)
}

/** Is this line the `| --- | :--: |` separator row of a table? */
export function isSeparatorRow(text: string): boolean {
  const t = text.trim()
  if (!t.includes('|') || !t.includes('-')) return false
  return /^[|:\s-]+$/.test(t)
}

export interface LineRange {
  fromLine: number
  toLine: number
}

/**
 * Expand from a line to the full contiguous block of table rows around it.
 * Returns null if the line isn't a table row, or the block has no separator
 * (so a lone `| foo |` line isn't mistaken for a table).
 */
export function findTableRange(lines: string[], lineIdx: number): LineRange | null {
  if (lineIdx < 0 || lineIdx >= lines.length) return null
  if (!isTableRow(lines[lineIdx]!)) return null
  let from = lineIdx
  while (from > 0 && isTableRow(lines[from - 1]!)) from--
  let to = lineIdx
  while (to < lines.length - 1 && isTableRow(lines[to + 1]!)) to++
  let hasSep = false
  for (let i = from; i <= to; i++) {
    if (isSeparatorRow(lines[i]!)) {
      hasSep = true
      break
    }
  }
  return hasSep ? { fromLine: from, toLine: to } : null
}

export interface CellRange {
  from: number
  to: number
}

/**
 * Content ranges of each cell in a table row (char offsets within the line,
 * between pipes). Assumes the line starts with `|`. Escaped pipes (`\|`) are
 * skipped. Spaces inside the cell are kept so callers can choose cursor placement.
 */
export function cellRanges(text: string): CellRange[] {
  const ranges: CellRange[] = []
  let cellStart = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '\\') {
      i++ // skip the escaped char
      continue
    }
    if (ch === '|') {
      if (cellStart >= 0) ranges.push({ from: cellStart, to: i })
      cellStart = i + 1
    }
  }
  return ranges
}

/**
 * Index (0-based) of the cell containing `linePos`, or -1 if not inside a cell.
 * A position on a pipe counts as the cell to its right.
 */
export function cellIndexAt(text: string, linePos: number, ranges?: CellRange[]): number {
  const cells = ranges ?? cellRanges(text)
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!
    if (linePos >= c.from && linePos <= c.to) return i
  }
  return -1
}

/**
 * Cursor position (char offset within the line) for the start of a cell's
 * trimmed content — where Tab should land.
 */
export function cellContentPos(text: string, cell: CellRange): number {
  let from = cell.from
  let to = cell.to
  while (from < to && /\s/.test(text[from]!)) from++
  while (to > from && /\s/.test(text[to - 1]!)) to--
  return from
}
