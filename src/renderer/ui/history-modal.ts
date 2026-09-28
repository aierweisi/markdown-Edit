import type { AppContext } from '../context'
import type { TabManager } from '../tabs/tab-manager'
import { escHtml } from '../lib/fs-paths'
import { showToast } from './toast'

interface HistoryModalDeps {
  ctx: AppContext
  tabs: TabManager
  /** Refresh editor/preview when the restored tab is the active one. */
  onRestored(tabId: string, content: string): void
}

/**
 * Version list + read-only preview for a file's local history (archived by
 * the main process before each overwrite). "恢复此版本" loads the archived
 * content into the tab and marks it dirty — the user saves consciously, so
 * restoring can never silently overwrite anything.
 */
export function showHistoryModal(
  deps: HistoryModalDeps,
  tabId: string,
  filePath: string,
  title: string,
): void {
  const tab = deps.tabs.getById(tabId)
  if (!tab) return

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay open'
  overlay.innerHTML = `
    <div class="modal modal-history" style="width: min(860px, 92vw)">
      <div class="modal-header"><h2>历史版本 — ${escHtml(title)}</h2></div>
      <div class="history-body">
        <div class="history-list" data-slot="list"><div class="history-empty">加载中…</div></div>
        <pre class="history-preview" data-slot="preview">选择左侧版本查看内容</pre>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" type="button" data-act="close">关闭</button>
        <button class="btn-primary" type="button" data-act="restore" disabled>恢复此版本</button>
      </div>
    </div>`
  document.body.appendChild(overlay)

  const listEl = overlay.querySelector<HTMLElement>('[data-slot="list"]')!
  const previewEl = overlay.querySelector<HTMLElement>('[data-slot="preview"]')!
  const restoreBtn = overlay.querySelector<HTMLButtonElement>('[data-act="restore"]')!
  let selectedTs: number | null = null
  let selectedContent = ''

  const fmt = (ts: number): string => {
    const d = new Date(ts)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  const close = (): void => {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  overlay.querySelector('[data-act="close"]')!.addEventListener('click', close)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey)

  void (async () => {
    const res = await deps.ctx.api.historyList(filePath)
    if (!overlay.isConnected) return
    if (!res.success) {
      listEl.innerHTML = `<div class="history-empty">${escHtml(res.error)}</div>`
      return
    }
    if (res.versions.length === 0) {
      listEl.innerHTML =
        '<div class="history-empty">暂无历史版本<br>保存产生修改后自动归档<br>（每 5 分钟最多一份，每文件保留 30 份）</div>'
      return
    }
    listEl.innerHTML = ''
    for (const v of res.versions) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'history-item'
      row.innerHTML = `<span class="history-item-time">${fmt(v.ts)}</span><span class="history-item-size">${(
        v.size / 1024
      ).toFixed(1)} KB</span>`
      row.addEventListener('click', () => {
        listEl.querySelectorAll('.history-item').forEach((el) => el.classList.remove('active'))
        row.classList.add('active')
        previewEl.textContent = '加载中…'
        selectedTs = v.ts
        selectedContent = ''
        restoreBtn.disabled = true
        void deps.ctx.api.historyRead(filePath, v.ts).then((r) => {
          if (!overlay.isConnected || selectedTs !== v.ts) return
          if (!r.success) {
            previewEl.textContent = `读取失败: ${r.error}`
            return
          }
          selectedContent = r.content
          previewEl.textContent = r.content
          restoreBtn.disabled = false
        })
      })
      listEl.appendChild(row)
    }
  })()

  restoreBtn.addEventListener('click', () => {
    if (selectedTs == null || !selectedContent) return
    deps.tabs.setContent(tabId, selectedContent)
    deps.tabs.markModified(tabId, true)
    deps.onRestored(tabId, selectedContent)
    close()
    showToast('已载入历史版本 — 确认后保存生效', 'success')
  })
}
