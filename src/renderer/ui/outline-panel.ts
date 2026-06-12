import type { AppContext } from '../context'
import { parseHeadings, type Heading } from '../lib/parse-headings'

export interface OutlineApi {
  refresh(text: string): void
  toggle(): void
  setVisible(visible: boolean): void
  isVisible(): boolean
}

interface OutlineOpts {
  ctx: AppContext
  onJump(line: number): void
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
  })
}

export function createOutlinePanel(opts: OutlineOpts): OutlineApi {
  const panel = document.createElement('aside')
  panel.className = 'outline-pane'
  panel.innerHTML = `
    <div class="outline-pane__header">
      <span class="outline-pane__title">大纲</span>
      <span class="outline-pane__count" data-slot="count"></span>
      <button type="button" class="outline-pane__close" title="关闭">✕</button>
    </div>
    <div class="outline-pane__list" data-slot="list"></div>
  `
  document.body.appendChild(panel)

  const listEl = panel.querySelector<HTMLElement>('[data-slot="list"]')!
  const countEl = panel.querySelector<HTMLElement>('[data-slot="count"]')!
  let visible = false
  let lastHeadings: Heading[] = []

  panel.addEventListener('click', (evt) => {
    const t = evt.target as HTMLElement
    if (t.closest('.outline-pane__close')) {
      setVisible(false)
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
    countEl.textContent = headings.length === 0 ? '' : `${headings.length}`
    if (headings.length === 0) {
      listEl.innerHTML = '<p class="outline-pane__empty">暂无标题</p>'
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

  function setVisible(v: boolean): void {
    visible = v
    panel.classList.toggle('outline-pane--open', v)
    document.body.classList.toggle('has-outline-open', v)
    const btn = document.getElementById('btn-outline')
    if (btn) btn.classList.toggle('active', v)
  }

  return {
    refresh(text) {
      render(parseHeadings(text))
    },
    toggle() {
      setVisible(!visible)
      if (visible && lastHeadings.length === 0) {
        // give the layout a moment, then re-render placeholder
        render(lastHeadings)
      }
    },
    setVisible,
    isVisible: () => visible,
  }
}
