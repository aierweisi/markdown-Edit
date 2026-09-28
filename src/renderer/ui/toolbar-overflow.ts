/**
 * Toolbar overflow manager. The merged title/format toolbar packs file ops,
 * 13 format buttons, template/export/view/theme/settings and the window
 * controls into one 46px row. Width-based media queries used to hide buttons
 * at fixed thresholds, which made the visible set flicker as the window
 * resized — no stable muscle memory.
 *
 * Instead this measures the row (ResizeObserver + sidebar toggle fallback) and
 * moves the lowest-priority buttons, in priority order, into a "⋯" dropdown
 * until everything fits. The original buttons stay in the DOM (display:none)
 * with their handlers intact; menu items simply .click() them, so no handler
 * logic is duplicated here.
 *
 * Order note: entries earlier in OVERFLOW_ORDER overflow first. Window
 * controls never overflow.
 */

/** Candidates for overflow: [selector, menu label]. Priority = position. */
const OVERFLOW_ORDER: ReadonlyArray<readonly [string, string]> = [
  ['fmt-btn[data-action="hr"]', '分割线'],
  ['fmt-btn[data-action="codeblock"]', '代码块'],
  ['fmt-btn[data-action="quote"]', '引用'],
  ['fmt-btn[data-action="table"]', '表格'],
  ['fmt-btn[data-action="strikethrough"]', '删除线'],
  ['fmt-btn[data-action="image"]', '插入图片'],
  ['fmt-btn[data-action="link"]', '插入链接'],
  ['fmt-btn[data-action="code"]', '行内代码'],
  ['fmt-btn[data-action="ol"]', '有序列表'],
  ['fmt-btn[data-action="ul"]', '无序列表'],
  ['#btn-theme', '切换主题'],
  ['#btn-template', '模板库'],
  ['#btn-swap-panes', '互换编辑/预览位置'],
  ['#btn-view-toggle', '切换视图'],
  ['fmt-btn[data-action="italic"]', '斜体'],
  ['fmt-btn[data-action="bold"]', '粗体'],
  ['fmt-btn[data-action="heading"]', '标题'],
  ['#btn-save', '保存'],
  ['#btn-open', '打开'],
  ['#btn-new', '新建'],
]

export function initToolbarOverflow(): void {
  const toolbarEl = document.getElementById('toolbar')
  const toggleEl = document.getElementById('btn-toolbar-overflow')
  const menuEl = document.getElementById('toolbar-overflow-menu')
  if (!toolbarEl || !toggleEl || !menuEl) return
  // The helpers below are hoisted function declarations, which TypeScript
  // treats as created before the guard — so they don't inherit its narrowing
  // (that only holds for closures created after the narrowing point). Rebind
  // to non-null consts the inner functions can capture without `!` noise.
  const toolbar = toolbarEl
  const toggle = toggleEl
  const menu = menuEl

  /** How many entries (by index in OVERFLOW_ORDER) are currently overflowing. */
  let overflowCount = 0
  let menuOpen = false

  // ── measurement ────────────────────────────────────────────────────────
  // The window controls sit at the row's right edge and must never be pushed
  // off-screen. Available space = distance from the row's content end to the
  // window controls' left edge. The overflow toggle itself consumes ~30px of
  // that budget whenever it is visible.
  function availableWidth(): number {
    const ctrls = document.getElementById('window-controls')
    if (!ctrls) return toolbar.getBoundingClientRect().right
    return ctrls.getBoundingClientRect().left - 6
  }
  function contentEndX(): number {
    // Rightmost visible child's right edge, skipping the toggle, the dropdown
    // host and the window controls (the last is the boundary, not content).
    let right = toolbar.getBoundingClientRect().left
    for (const el of Array.from(toolbar.children)) {
      if (!(el instanceof HTMLElement)) continue
      if (el.id === 'btn-toolbar-overflow' || el.id === 'window-controls') continue
      if (el.id === 'toolbar-overflow-menu') continue
      if (el.classList.contains('toolbar-btn-hidden-overflow')) continue
      const r = el.getBoundingClientRect()
      if (r.width > 0) right = Math.max(right, r.right)
    }
    return right
  }

  /** ~Toggle footprint when `count` items overflow (applied after the loop, so
   *  it can't be read from live layout mid-recalc). */
  function toggleWidthFor(count: number): number {
    return count > 0 ? 30 : 0
  }

  function applyOverflow(count: number): void {
    resolveAll(OVERFLOW_ORDER.slice(0, count)).forEach((b) =>
      b.classList.add('toolbar-btn-hidden-overflow'),
    )
    resolveAll(OVERFLOW_ORDER.slice(count)).forEach((b) =>
      b.classList.remove('toolbar-btn-hidden-overflow'),
    )
  }

  function recalc(): void {
    let count = 0
    // Grow overflow until the row fits (never beyond every candidate).
    while (count <= OVERFLOW_ORDER.length) {
      applyOverflow(count)
      if (contentEndX() + toggleWidthFor(count) <= availableWidth()) break
      if (count >= OVERFLOW_ORDER.length) break
      count++
    }
    const changed = count !== overflowCount
    overflowCount = count
    toggle.classList.toggle('has-overflow', count > 0)
    if (changed) {
      renderMenu()
      if (count === 0 && menuOpen) closeMenu()
    }
  }

  function resolve(sel: string): HTMLElement | null {
    return toolbar.querySelector<HTMLElement>(sel)
  }
  function resolveAll(entries: ReadonlyArray<readonly [string, string]>): HTMLElement[] {
    const out: HTMLElement[] = []
    for (const [sel] of entries) {
      const b = resolve(sel)
      if (b) out.push(b)
    }
    return out
  }

  // ── menu ───────────────────────────────────────────────────────────────
  function renderMenu(): void {
    if (overflowCount === 0) {
      menu.innerHTML = ''
      return
    }
    menu.innerHTML = ''
    const entries = OVERFLOW_ORDER.slice(0, overflowCount)
    for (const [sel, label] of entries) {
      const btn = resolve(sel)
      if (!btn) continue
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'toolbar-overflow-item'
      item.setAttribute('role', 'menuitem')
      // Reuse the original button's icon (clone) — visual parity with the row.
      const svg = btn.querySelector('svg')
      if (svg) {
        const clone = svg.cloneNode(true) as SVGElement
        clone.removeAttribute('id') // avoid duplicated #view-icon / #theme-icon ids
        item.appendChild(clone)
      }
      const text = document.createElement('span')
      text.textContent = btn.title?.split(' (')[0] || label
      item.appendChild(text)
      item.addEventListener('click', () => {
        closeMenu()
        btn.click()
      })
      menu.appendChild(item)
    }
  }

  function openMenu(): void {
    if (overflowCount === 0) return
    renderMenu() // icons may have changed (theme/view toggle state)
    menu.classList.add('open')
    toggle.setAttribute('aria-expanded', 'true')
    menuOpen = true
    const r = toggle.getBoundingClientRect()
    // position:fixed — anchor to the toggle, clamped to the viewport.
    menu.style.top = `${r.bottom + 5}px`
    menu.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - 200))}px`
    menu.querySelector<HTMLElement>('.toolbar-overflow-item')?.focus()
  }
  function closeMenu(): void {
    menu.classList.remove('open')
    toggle.setAttribute('aria-expanded', 'false')
    if (menuOpen) toggle.focus()
    menuOpen = false
  }

  toggle.addEventListener('click', (evt) => {
    evt.stopPropagation()
    if (menuOpen) closeMenu()
    else openMenu()
  })
  menu.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      evt.stopPropagation()
      closeMenu()
    }
  })
  document.addEventListener('click', (evt) => {
    if (menuOpen && !menu.contains(evt.target as Node) && evt.target !== toggle) closeMenu()
  })

  // ── triggers ───────────────────────────────────────────────────────────
  new ResizeObserver(() => recalc()).observe(toolbar)
  window.addEventListener('resize', () => recalc())
  // The workspace sidebar shifts the row's available width via padding changes
  // without resizing the toolbar itself — recalc on the next frame.
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => requestAnimationFrame(recalc)).observe(
      document.getElementById('sidebar-host') ?? document.body,
      { attributes: true, attributeFilter: ['class'] },
    )
  }
  // Initial pass after layout settles.
  requestAnimationFrame(() => recalc())
}
