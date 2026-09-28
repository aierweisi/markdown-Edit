import type { EditorView } from '@codemirror/view'
import type { LineRange } from './table-parser'
import { cellRanges, cellIndexAt, findTableRangeAt, isSeparatorRow } from './table-parser'

interface TableSnapshot {
  range: LineRange
  /** 0-based index of the separator row. */
  sepIdx: number
  /** How many data rows (non-separator) the table has. */
  dataRows: number
}

/**
 * Right-click context menu inside GFM tables in the editor: insert/delete
 * rows and columns, switch column alignment. Everything the actions need is
 * captured when the menu opens (they run after any dispatch, so they must
 * not recompute from live state). Rows/columns are rebuilt from parsed cells
 * and applied as editor transactions.
 */
export function attachTableMenu(view: EditorView): () => void {
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

  const getLine = (i: number): string => view.state.doc.line(i + 1).text

  function snapshot(range: LineRange): TableSnapshot {
    let sepIdx = -1
    let dataRows = 0
    for (let i = range.fromLine; i <= range.toLine; i++) {
      if (isSeparatorRow(getLine(i))) sepIdx = i
      else dataRows++
    }
    return { range, sepIdx, dataRows }
  }

  // ── row/column primitives (all indices 0-based) ─────────────────────
  /** Insert `rowText` so it becomes line index `idx`. */
  function insertLineAt(idx: number, rowText: string): void {
    if (idx <= 0) {
      view.dispatch({ changes: { from: 0, insert: rowText + '\n' } })
      return
    }
    view.dispatch({ changes: { from: view.state.doc.line(idx).to, insert: '\n' + rowText } })
  }

  function deleteLine(idx: number): void {
    const cur = view.state.doc.line(idx + 1)
    const from = idx > 0 ? view.state.doc.line(idx).to : cur.from
    const to = idx + 1 < view.state.doc.lines ? view.state.doc.line(idx + 2).from : cur.to
    view.dispatch({ changes: { from, to } })
  }

  /** Rebuild line `idx` with its cells transformed; skip when the transform
   *  returns null (ragged rows stay untouched rather than corrupted). */
  function mapRow(snap: TableSnapshot, idx: number, fn: (cells: string[], sep: boolean) => string[] | null): void {
    if (idx < snap.range.fromLine || idx > snap.range.toLine) return
    const text = getLine(idx)
    const cells = cellRanges(text)
    if (cells.length === 0) return
    const raw = cells.map((c) => text.slice(c.from, c.to))
    const next = fn(raw, isSeparatorRow(text))
    if (!next) return
    const ln = view.state.doc.line(idx + 1)
    view.dispatch({ changes: { from: ln.from, to: ln.to, insert: '|' + next.join('|') + '|' } })
  }

  // ── actions (context captured at menu-open time) ────────────────────
  function insertRow(snap: TableSnapshot, clickedIdx: number, below: boolean, cellCount: number): void {
    const row = '|' + Array.from({ length: cellCount }, () => '   ').join('|') + '|'
    // Never land between the header and its separator.
    let target: number
    if (below) target = clickedIdx + 1 === snap.sepIdx ? snap.sepIdx + 1 : clickedIdx + 1
    else target = clickedIdx === snap.sepIdx + 1 ? snap.sepIdx + 1 : clickedIdx
    insertLineAt(target, row)
  }

  function insertCol(snap: TableSnapshot, col: number, right: boolean): void {
    const at = col + (right ? 1 : 0)
    for (let i = snap.range.fromLine; i <= snap.range.toLine; i++) {
      mapRow(snap, i, (cells, sep) => {
        const copy = [...cells]
        copy.splice(Math.min(at, copy.length), 0, sep ? ' --- ' : '   ')
        return copy
      })
    }
  }

  function deleteCol(snap: TableSnapshot, col: number): void {
    for (let i = snap.range.fromLine; i <= snap.range.toLine; i++) {
      mapRow(snap, i, (cells) => (cells.length > 1 ? cells.filter((_, j) => j !== col) : null))
    }
  }

  function alignCol(snap: TableSnapshot, col: number, mode: 'left' | 'center' | 'right'): void {
    const mark = mode === 'left' ? ':--' : mode === 'center' ? ':-:' : '--:'
    for (let i = snap.range.fromLine; i <= snap.range.toLine; i++) {
      if (!isSeparatorRow(getLine(i))) continue
      mapRow(snap, i, (cells) => cells.map((t, j) => (j === col ? mark : t.length > 0 ? t : ' --- ')))
      break
    }
  }

  // ── menu ─────────────────────────────────────────────────────────────
  const onContextMenu = (evt: MouseEvent): void => {
    closeMenu()
    const pos = view.posAtCoords({ x: evt.clientX, y: evt.clientY })
    if (pos == null) return
    const lineObj = view.state.doc.lineAt(pos)
    const lineIdx = lineObj.number - 1
    const range = findTableRangeAt(getLine, view.state.doc.lines, lineIdx)
    if (!range) return // not a table → let the native menu through

    evt.preventDefault()
    const snap = snapshot(range)
    const text = lineObj.text
    const onSep = isSeparatorRow(text)
    const cells = cellRanges(text)
    const col = onSep ? -1 : cellIndexAt(text, pos - lineObj.from, cells)
    const cellCount = cells.length || cellRanges(getLine(snap.range.fromLine)).length

    type Item = { label: string; danger?: boolean; run: () => void } | { sep: true }
    const items: Item[] = []
    // A click on the separator acts on the header row instead (nothing can be
    // inserted "into" the separator itself).
    const rowIdx = onSep ? snap.sepIdx - 1 : lineIdx
    const headerIdx = snap.sepIdx - 1
    const isData = rowIdx !== snap.sepIdx && rowIdx !== headerIdx && rowIdx >= snap.range.fromLine
    if (isData || (onSep && snap.sepIdx > snap.range.fromLine)) {
      items.push({ label: '在上方插入行', run: () => insertRow(snap, rowIdx, false, cellCount) })
      items.push({ label: '在下方插入行', run: () => insertRow(snap, rowIdx, true, cellCount) })
      // Header can't be deleted; the last data row would leave an empty table.
      if (isData && snap.dataRows > 1) {
        items.push({ label: '删除此行', danger: true, run: () => deleteLine(lineIdx) })
      }
    }
    if (col >= 0 && cellCount > 0) {
      if (items.length > 0) items.push({ sep: true })
      items.push({ label: '在左侧插入列', run: () => insertCol(snap, col, false) })
      items.push({ label: '在右侧插入列', run: () => insertCol(snap, col, true) })
      if (cellCount > 1) items.push({ label: '删除此列', danger: true, run: () => deleteCol(snap, col) })
      items.push({ sep: true })
      items.push({ label: '此列左对齐', run: () => alignCol(snap, col, 'left') })
      items.push({ label: '此列居中', run: () => alignCol(snap, col, 'center') })
      items.push({ label: '此列右对齐', run: () => alignCol(snap, col, 'right') })
    }
    if (items.length === 0) return

    menuEl = document.createElement('div')
    menuEl.className = 'context-menu'
    for (const it of items) {
      if ('sep' in it) {
        const s = document.createElement('div')
        s.className = 'context-menu-separator'
        menuEl.appendChild(s)
        continue
      }
      const b = document.createElement('div')
      b.className = 'context-menu-item' + (it.danger ? ' is-danger' : '')
      b.textContent = it.label
      b.addEventListener('click', () => {
        closeMenu()
        it.run()
      })
      menuEl.appendChild(b)
    }
    menuEl.style.left = `${Math.min(evt.clientX, window.innerWidth - 180)}px`
    menuEl.style.top = `${Math.min(evt.clientY, window.innerHeight - items.length * 32 - 16)}px`
    document.body.appendChild(menuEl)
    // Close on outside mousedown only (same rationale as the tree's menu: an
    // outside *click* handler would swallow the item's own click).
    outsideDown = (e: MouseEvent): void => {
      if (menuEl && !menuEl.contains(e.target as Node)) closeMenu()
    }
    setTimeout(() => {
      if (outsideDown) document.addEventListener('mousedown', outsideDown)
    }, 0)
  }

  view.dom.addEventListener('contextmenu', onContextMenu)
  return () => {
    view.dom.removeEventListener('contextmenu', onContextMenu)
    closeMenu()
  }
}
