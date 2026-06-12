import type { AppContext } from '../context'
import { countChars, countWords, estimateReadingMinutes } from '../lib/word-count'

export interface StatusBarApi {
  setCursor(line: number, col: number, selection: number): void
  setText(text: string): void
  setSaving(saving: boolean): void
  setTitle(title: string, modified: boolean): void
}

interface StatusBarDeps {
  ctx: AppContext
  rootId?: string
}

export function createStatusBar(deps: StatusBarDeps): StatusBarApi {
  const root = document.getElementById(deps.rootId ?? 'statusbar')
  if (!root) {
    return {
      setCursor() {},
      setText() {},
      setSaving() {},
      setTitle() {},
    }
  }

  root.innerHTML = `
    <div class="statusbar__left">
      <span data-slot="file">未命名</span>
      <span class="statusbar__sep">·</span>
      <span data-slot="modified"></span>
      <span class="statusbar__sep">·</span>
      <span data-slot="cursor">行 1, 列 1</span>
      <span class="statusbar__sep">·</span>
      <span data-slot="selection"></span>
    </div>
    <div class="statusbar__right">
      <span data-slot="readtime"></span>
      <span class="statusbar__sep" data-slot-sep="readtime"></span>
      <span data-slot="chars"></span>
      <span class="statusbar__sep" data-slot-sep="chars"></span>
      <span data-slot="saving"></span>
      <span class="statusbar__sep" data-slot-sep="saving"></span>
      <span data-slot="encoding">UTF-8</span>
    </div>`

  const slots: Record<string, HTMLElement | null> = {
    file: root.querySelector('[data-slot="file"]'),
    modified: root.querySelector('[data-slot="modified"]'),
    cursor: root.querySelector('[data-slot="cursor"]'),
    selection: root.querySelector('[data-slot="selection"]'),
    readtime: root.querySelector('[data-slot="readtime"]'),
    chars: root.querySelector('[data-slot="chars"]'),
    saving: root.querySelector('[data-slot="saving"]'),
  }

  function setSlot(name: string, text: string): void {
    const el = slots[name]
    if (el) el.textContent = text
    const sep = root!.querySelector<HTMLElement>(`[data-slot-sep="${name}"]`)
    if (sep) sep.style.display = text ? '' : 'none'
  }

  // React to active-tab signal for title display
  deps.ctx.store.activeTabId.subscribe(() => {
    const t = deps.ctx.store.tabs().find((x) => x.id === deps.ctx.store.activeTabId())
    if (t) api.setTitle(t.title, t.modified)
  })
  deps.ctx.store.tabs.subscribe(() => {
    const t = deps.ctx.store.tabs().find((x) => x.id === deps.ctx.store.activeTabId())
    if (t) api.setTitle(t.title, t.modified)
  })

  const api: StatusBarApi = {
    setCursor(line, col, selection) {
      setSlot('cursor', `行 ${line}, 列 ${col}`)
      setSlot('selection', selection > 0 ? `选中 ${selection} 字符` : '')
    },
    setText(text) {
      const wc = countWords(text)
      const cc = countChars(text)
      setSlot('chars', cc.total > 0 ? `${cc.total} 字符（不含空白 ${cc.noWhitespace}）` : '')
      setSlot('readtime', wc > 0 ? `约 ${estimateReadingMinutes(wc)} 分钟阅读` : '')
    },
    setSaving(saving) {
      if (saving) setSlot('saving', '保存中…')
      else {
        const now = new Date()
        setSlot(
          'saving',
          `已保存 ${now.toLocaleTimeString('zh-CN', { hour12: false })}`,
        )
      }
    },
    setTitle(title, modified) {
      setSlot('file', title)
      setSlot('modified', modified ? '已修改' : '')
    },
  }
  return api
}
