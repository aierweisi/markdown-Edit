import type { AppContext } from '../context'
import { parseHeadings, type Heading } from '../lib/parse-headings'

export interface OutlineApi {
  refresh(text: string): void
  setTitle(title: string): void
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
      <span class="outline-pane__title" data-slot="title">大纲</span>
      <span class="outline-pane__count" data-slot="count"></span>
      <button type="button" class="outline-pane__close" title="关闭">✕</button>
    </div>
    <div class="outline-pane__list" data-slot="list"></div>
  `
  document.body.appendChild(panel)

  const titleEl = panel.querySelector<HTMLElement>('[data-slot="title"]')!
  const listEl = panel.querySelector<HTMLElement>('[data-slot="list"]')!
  const countEl = panel.querySelector<HTMLElement>('[data-slot="count"]')!
  let visible = false
  let lastHeadings: Heading[] = []

  /** Anchor outline below the tab bar by measuring real DOM offsets. */
  function alignTop(): void {
    const tabbar = document.getElementById('tabbar')
    const rect = tabbar?.getBoundingClientRect()
    if (rect && rect.bottom > 0) {
      panel.style.top = `${rect.bottom}px`
    } else {
      panel.style.top = '108px' // sensible fallback
    }
  }

  // re-align on resize and on initial show
  window.addEventListener('resize', alignTop, { passive: true })
  alignTop()

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

  function setVisible(v: boolean): void {
    visible = v
    if (v) alignTop()
    panel.classList.toggle('outline-pane--open', v)
    document.body.classList.toggle('has-outline-open', v)
    const btn = document.getElementById('btn-outline')
    if (btn) btn.classList.toggle('active', v)
  }

  return {
    refresh(text) {
      render(parseHeadings(text))
    },
    setTitle(title) {
      titleEl.textContent = title || '大纲'
      titleEl.title = title || ''
    },
    toggle() {
      setVisible(!visible)
      if (visible && lastHeadings.length === 0) render(lastHeadings)
    },
    setVisible,
    isVisible: () => visible,
  }
}
