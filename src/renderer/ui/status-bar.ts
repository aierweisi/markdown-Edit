import type { AppContext } from '../context'
import type { StatusBarConfig } from '@shared/types'
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
  cursor: 'status-sep2',
  selection: 'status-selection-sep',
  readtime: 'status-readtime-sep',
  chars: 'status-chars-sep',
  saving: 'status-autosave-sep',
}

/** Slots whose visibility the user can toggle in settings → their StatusBarConfig key. */
const TOGGLE_CFG: Partial<Record<keyof typeof SLOT_IDS, keyof StatusBarConfig>> = {
  cursor: 'cursor',
  selection: 'selection',
  readtime: 'readtime',
  chars: 'chars',
  saving: 'autosave',
}

export function createStatusBar(deps: StatusBarDeps): StatusBarApi {
  let cfg: StatusBarConfig = deps.ctx.store.settings().statusBar ?? {
    cursor: true,
    selection: true,
    readtime: true,
    chars: true,
    autosave: true,
  }
  const lastText: Partial<Record<keyof typeof SLOT_IDS, string>> = {}

  function setSlot(name: keyof typeof SLOT_IDS, text: string): void {
    lastText[name] = text
    const cfgKey = TOGGLE_CFG[name]
    // Treat undefined as visible (backward compat with older 3-field statusBar).
    const show = (cfgKey ? cfg[cfgKey] !== false : true) && !!text
    const el = document.getElementById(SLOT_IDS[name])
    if (el) {
      el.textContent = text
      el.style.display = show ? '' : 'none'
    }
    const sepId = SEP_IDS[name]
    if (sepId) {
      const sep = document.getElementById(sepId)
      if (sep) sep.style.display = show ? '' : 'none'
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

  // Drive the "saving…" / "saved HH:MM:SS" indicator from the saving signal so
  // both manual saves and autosave update the bar uniformly. Only show the
  // "saved" timestamp after a real true→false transition — never on the initial
  // false at app start — so we don't display a save that never happened.
  let wasSaving = false
  deps.ctx.store.saving.subscribe((saving) => {
    if (saving) {
      wasSaving = true
      api.setSaving(true)
    } else if (wasSaving) {
      wasSaving = false
      api.setSaving(false)
    }
  })

  // Re-apply segment visibility when the user toggles status-bar segments in settings.
  deps.ctx.store.settings.subscribe((s) => {
    cfg = s.statusBar
    ;(['cursor', 'selection', 'readtime', 'chars', 'saving'] as const).forEach((k) => setSlot(k, lastText[k] ?? ''))
  })

  return api
}
