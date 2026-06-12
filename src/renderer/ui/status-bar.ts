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
}

const SLOT_IDS = {
  file: 'status-file',
  modified: 'status-modified',
  cursor: 'status-cursor',
  selection: 'status-selection',
  readtime: 'status-readtime',
  chars: 'status-chars',
  saving: 'status-autosave',
} as const

const SEP_IDS: Record<keyof typeof SLOT_IDS, string | undefined> = {
  file: undefined,
  modified: undefined,
  cursor: undefined,
  selection: undefined,
  readtime: 'status-readtime-sep',
  chars: 'status-chars-sep',
  saving: 'status-autosave-sep',
}

export function createStatusBar(deps: StatusBarDeps): StatusBarApi {
  function setSlot(name: keyof typeof SLOT_IDS, text: string): void {
    const el = document.getElementById(SLOT_IDS[name])
    if (el) el.textContent = text
    const sepId = SEP_IDS[name]
    if (sepId) {
      const sep = document.getElementById(sepId)
      if (sep) sep.style.display = text ? '' : 'none'
    }
  }

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
      const wcEl = document.getElementById('word-count')
      if (wcEl) wcEl.textContent = `${wc} 字`
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

  // React to active tab + tabs list signals to keep title in sync
  deps.ctx.store.activeTabId.subscribe(() => {
    const t = deps.ctx.store.tabs().find((x) => x.id === deps.ctx.store.activeTabId())
    if (t) api.setTitle(t.title, t.modified)
  })
  deps.ctx.store.tabs.subscribe(() => {
    const t = deps.ctx.store.tabs().find((x) => x.id === deps.ctx.store.activeTabId())
    if (t) api.setTitle(t.title, t.modified)
  })

  return api
}
