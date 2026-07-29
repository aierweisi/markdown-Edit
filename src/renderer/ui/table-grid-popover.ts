export interface TableGridResult {
  rows: number
  cols: number
}

const MAX = 8

/**
 * Open an N×M grid popover anchored below `anchor` so the user can pick a table
 * size (hover to highlight, click to confirm). Resolves with {rows, cols}, or
 * null if dismissed (click outside / Esc). Removes itself on close.
 */
export function openTableGrid(anchor: HTMLElement): Promise<TableGridResult | null> {
  return new Promise((resolve) => {
    let rows = 1
    let cols = 1

    const popover = document.createElement('div')
    popover.className = 'table-grid-popover'
    popover.innerHTML = `
      <div class="table-grid"></div>
      <div class="table-grid-label">1 × 1</div>`

    const grid = popover.querySelector<HTMLElement>('.table-grid')!
    grid.style.gridTemplateColumns = `repeat(${MAX}, 1fr)`
    for (let r = 1; r <= MAX; r++) {
      for (let c = 1; c <= MAX; c++) {
        const cell = document.createElement('div')
        cell.className = 'table-grid-cell'
        cell.dataset.row = String(r)
        cell.dataset.col = String(c)
        grid.appendChild(cell)
      }
    }
    const label = popover.querySelector<HTMLElement>('.table-grid-label')!

    const rect = anchor.getBoundingClientRect()
    popover.style.top = `${rect.bottom + 4}px`
    popover.style.left = `${rect.left}px`
    document.body.appendChild(popover)

    const highlight = (r: number, c: number): void => {
      rows = r
      cols = c
      label.textContent = `${r} × ${c}`
      grid.querySelectorAll<HTMLElement>('.table-grid-cell').forEach((cell) => {
        const cr = Number(cell.dataset.row)
        const cc = Number(cell.dataset.col)
        cell.classList.toggle('active', cr <= r && cc <= c)
      })
    }

    grid.querySelectorAll<HTMLElement>('.table-grid-cell').forEach((cell) => {
      cell.addEventListener('mouseenter', () =>
        highlight(Number(cell.dataset.row), Number(cell.dataset.col)),
      )
      cell.addEventListener('click', () => finish({ rows, cols }))
    })

    const finish = (val: TableGridResult | null): void => {
      popover.remove()
      document.removeEventListener('mousedown', onOutside, true)
      document.removeEventListener('keydown', onEsc)
      resolve(val)
    }
    const onOutside = (e: MouseEvent): void => {
      if (!popover.contains(e.target as Node)) finish(null)
    }
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(null)
    }
    // delay attaching the outside-click handler so the opening click doesn't close it
    setTimeout(() => {
      document.addEventListener('mousedown', onOutside, true)
      document.addEventListener('keydown', onEsc)
    }, 0)
  })
}
