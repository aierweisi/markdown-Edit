import type { AppContext } from '../context'
import { parseHeadings, type Heading } from '../lib/parse-headings'

export interface OutlineApi {
  refresh(text: string): void
  setTitle(title: string): void
  /** Re-render from the last parsed headings (used when the view becomes visible). */
  reRender(): void
}

interface OutlineOpts {
  ctx: AppContext
  onJump(line: number): void
  /** Called when the outline's own close button is clicked. */
  onClose?(): void
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
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
        <div class="outline-pane__item outline-pane__item--h${h.level}" data-line="${h.line}" title="${escape(
          h.text,
        )}">
          <span class="outline-pane__bullet"></span>
          <span class="outline-pane__text">${escape(h.text)}</span>
        </div>`,
      )
      .join('')
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
  }
}
