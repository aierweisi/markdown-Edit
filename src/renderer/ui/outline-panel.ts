import type { AppContext } from '../context'
import { parseHeadings, type Heading } from '../lib/parse-headings'
import { escHtml } from '../lib/fs-paths'

export interface OutlineApi {
  refresh(text: string): void
  setTitle(title: string): void
  /** Re-render from the last parsed headings (used when the view becomes visible). */
  reRender(): void
  /** Highlight the item for the heading currently scrolled into view. */
  attachScrollSpy(scrollContainer: HTMLElement): () => void
}

interface OutlineOpts {
  ctx: AppContext
  onJump(line: number): void
  /** Called when the outline's own close button is clicked. */
  onClose?(): void
}

/** Outline (document headings) view, mounted into the sidebar host's outline
 *  section. Visibility/view-switching is owned by the activitybar controller;
 *  this module only renders headings and reports jumps/close. */
export function createOutlinePanel(opts: OutlineOpts): OutlineApi {
  const panel = document.createElement('div')
  panel.className = 'outline-pane'
  panel.innerHTML = `
    <div class="outline-pane__header">
      <span class="outline-pane__title" data-slot="title">大纲</span>
      <span class="outline-pane__count" data-slot="count"></span>
      <button type="button" class="outline-pane__close" title="收起">✕</button>
    </div>
    <div class="outline-pane__list" data-slot="list"></div>
  `
  // Mount into the sidebar host's outline view (the <section> in index.html).
  document.getElementById('outline-view')?.appendChild(panel)

  const titleEl = panel.querySelector<HTMLElement>('[data-slot="title"]')!
  const listEl = panel.querySelector<HTMLElement>('[data-slot="list"]')!
  const countEl = panel.querySelector<HTMLElement>('[data-slot="count"]')!
  let lastHeadings: Heading[] = []

  panel.addEventListener('click', (evt) => {
    const t = evt.target as HTMLElement
    if (t.closest('.outline-pane__close')) {
      opts.onClose?.()
      return
    }
    const item = t.closest<HTMLElement>('[data-line]')
    if (item) {
      const line = parseInt(item.dataset.line ?? '0', 10)
      if (line > 0) opts.onJump(line)
    }
  })

  function render(headings: Heading[]): void {
    lastHeadings = headings
    countEl.textContent = headings.length === 0 ? '' : String(headings.length)
    if (headings.length === 0) {
      listEl.innerHTML = '<p class="outline-pane__empty">暂无标题<br>在文档中插入 # 标题</p>'
      return
    }
    listEl.innerHTML = headings
      .map(
        (h) => `
        <div class="outline-pane__item outline-pane__item--h${h.level}" data-line="${h.line}" title="${escHtml(
          h.text,
        )}">
          <span class="outline-pane__bullet"></span>
          <span class="outline-pane__text">${escHtml(h.text)}</span>
        </div>`,
      )
      .join('')
    // Items were just rebuilt, so re-stamp the active highlight if the spy runs.
    if (spyEl) syncActiveFromScroll()
  }

  // ── Scroll spy ─────────────────────────────────────────────────────────
  // Highlight the item whose source heading is currently in view inside the
  // preview. Preview <h1..h6> and outline items both carry data-line — the
  // 1-based source line from parseHeadings (see render.ts tagHeadingLines) —
  // so we match on that. The editor drives the preview via sync-scroll, so
  // listening on the preview container alone covers scrolling from either side.
  let spyEl: HTMLElement | null = null
  let spyRaf = 0

  function clearActive(): void {
    listEl.querySelectorAll('.outline-pane__item--active').forEach((el) => {
      el.classList.remove('outline-pane__item--active')
    })
  }

  function highlightLine(line: number): void {
    const items = Array.from(listEl.querySelectorAll<HTMLElement>('.outline-pane__item'))
    let matched: HTMLElement | null = null
    for (const it of items) {
      const active = line > 0 && parseInt(it.dataset.line ?? '0', 10) === line
      it.classList.toggle('outline-pane__item--active', active)
      if (active) matched = it
    }
    // Scroll the active item into the list's own viewport (manual so we never
    // bump the page or the preview — only the outline list scrolls).
    if (matched) {
      const m = matched
      const lr = listEl.getBoundingClientRect()
      const ir = m.getBoundingClientRect()
      if (ir.top < lr.top) listEl.scrollTop -= lr.top - ir.top + 4
      else if (ir.bottom > lr.bottom) listEl.scrollTop += ir.bottom - lr.bottom + 4
    }
  }

  function syncActiveFromScroll(): void {
    if (!spyEl) return
    const headings = Array.from(
      spyEl.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'),
    ).filter((h) => h.dataset.line)
    if (headings.length === 0) {
      clearActive()
      return
    }
    // A heading counts as "current" once it has scrolled past a line a little
    // below the preview's top edge; the active item is the last such heading
    // (i.e. the deepest section currently on screen). Headings are in document
    // order, so we can stop at the first one still below the threshold.
    const cTop = spyEl.getBoundingClientRect().top
    const threshold = cTop + Math.min(140, spyEl.clientHeight * 0.25)
    let activeLine = 0
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= threshold) {
        const ln = parseInt(h.dataset.line ?? '0', 10)
        if (ln > 0) activeLine = ln
      } else {
        break
      }
    }
    // At the very top, before any heading clears the threshold, pin the first.
    if (activeLine === 0) activeLine = parseInt(headings[0]?.dataset.line ?? '0', 10)
    highlightLine(activeLine)
  }

  return {
    refresh(text) {
      render(parseHeadings(text))
    },
    setTitle(title) {
      titleEl.textContent = title || '大纲'
      titleEl.title = title || ''
    },
    reRender() {
      render(lastHeadings)
    },
    attachScrollSpy(scrollContainer: HTMLElement): () => void {
      spyEl = scrollContainer
      const onScroll = (): void => {
        if (spyRaf) return
        spyRaf = requestAnimationFrame(() => {
          spyRaf = 0
          syncActiveFromScroll()
        })
      }
      scrollContainer.addEventListener('scroll', onScroll, { passive: true })
      syncActiveFromScroll()
      return () => {
        scrollContainer.removeEventListener('scroll', onScroll)
        if (spyRaf) cancelAnimationFrame(spyRaf)
        spyRaf = 0
        spyEl = null
        clearActive()
      }
    },
  }
}
