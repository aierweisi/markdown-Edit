/**
 * recent.js — Recent files tracker and picker
 */

const RecentFiles = (() => {
  const MAX_ITEMS = 15
  let items = []
  let overlay = null
  let list = null
  let input = null
  let selectedIdx = 0
  let onOpenCb = null

  async function load() {
    const stored = await window.api.storeGet('recentFiles')
    items = Array.isArray(stored) ? stored : []
    return items
  }

  async function save() {
    await window.api.storeSet('recentFiles', items)
  }

  async function add(filePath) {
    if (!filePath) return
    // Remove existing entry
    items = items.filter(it => it.path !== filePath)
    items.unshift({ path: filePath, ts: Date.now() })
    if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS)
    await save()
  }

  async function remove(filePath) {
    items = items.filter(it => it.path !== filePath)
    await save()
  }

  async function clear() {
    items = []
    await save()
  }

  function getAll() { return items.slice() }

  function buildUI() {
    if (overlay) return
    overlay = document.createElement('div')
    overlay.className = 'recent-overlay'
    overlay.id = 'recent-overlay'
    overlay.hidden = true
    overlay.innerHTML = `
      <div class="recent-modal" role="dialog" aria-label="最近文件">
        <div class="recent-header">
          <input type="text" class="recent-search" id="recent-search" placeholder="搜索最近文件..." spellcheck="false">
          <button class="recent-clear" id="recent-clear" title="清空列表">清空</button>
        </div>
        <div class="recent-list" id="recent-list"></div>
      </div>
    `
    document.body.appendChild(overlay)

    list = overlay.querySelector('#recent-list')
    input = overlay.querySelector('#recent-search')

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close()
    })
    overlay.querySelector('#recent-clear').addEventListener('click', async (e) => {
      e.stopPropagation()
      if (!confirm('清空最近文件列表？')) return
      await clear()
      render('')
    })
    input.addEventListener('input', () => {
      selectedIdx = 0
      render(input.value)
    })
    input.addEventListener('keydown', (e) => {
      const visible = list.querySelectorAll('.recent-item')
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(visible.length - 1, selectedIdx + 1); updateSelection() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); updateSelection() }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const el = visible[selectedIdx]
        if (el) openEntry(el.dataset.path)
      }
    })
  }

  function updateSelection() {
    const visible = list.querySelectorAll('.recent-item')
    visible.forEach((el, i) => el.classList.toggle('active', i === selectedIdx))
    const cur = visible[selectedIdx]
    if (cur) cur.scrollIntoView({ block: 'nearest' })
  }

  function fuzzyMatch(text, query) {
    if (!query) return true
    const t = text.toLowerCase()
    const q = query.toLowerCase()
    let ti = 0
    for (const ch of q) {
      const idx = t.indexOf(ch, ti)
      if (idx < 0) return false
      ti = idx + 1
    }
    return true
  }

  function fmtDate(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) return d.toTimeString().slice(0, 5)
    const diffDays = Math.floor((now - d) / 86400000)
    if (diffDays < 7) return `${diffDays} 天前`
    return d.toISOString().slice(0, 10)
  }

  function render(query) {
    const q = (query || '').trim()
    const filtered = items.filter(it => {
      const name = it.path.split(/[/\\]/).pop()
      return fuzzyMatch(name, q) || fuzzyMatch(it.path, q)
    })
    if (filtered.length === 0) {
      list.innerHTML = `<div class="recent-empty">${items.length === 0 ? '暂无最近文件' : '无匹配项'}</div>`
      return
    }
    list.innerHTML = filtered.map((it, i) => {
      const name = it.path.split(/[/\\]/).pop()
      const dir = it.path.slice(0, it.path.length - name.length).replace(/[\\/]$/, '')
      return `
        <div class="recent-item ${i === selectedIdx ? 'active' : ''}" data-path="${escapeAttr(it.path)}">
          <div class="recent-item-main">
            <div class="recent-item-name">${escapeHtml(name)}</div>
            <div class="recent-item-path">${escapeHtml(dir)}</div>
          </div>
          <div class="recent-item-meta">${fmtDate(it.ts)}</div>
          <button class="recent-item-remove" title="移除" data-remove="${escapeAttr(it.path)}">✕</button>
        </div>
      `
    }).join('')
    list.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.recent-item-remove')) return
        openEntry(el.dataset.path)
      })
    })
    list.querySelectorAll('.recent-item-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await remove(btn.dataset.remove)
        render(input.value)
      })
    })
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }
  function escapeAttr(s) { return escapeHtml(s) }

  async function openEntry(filePath) {
    close()
    if (onOpenCb) await onOpenCb(filePath)
  }

  function open() {
    buildUI()
    overlay.hidden = false
    selectedIdx = 0
    input.value = ''
    render('')
    setTimeout(() => input.focus(), 0)
  }

  function close() {
    if (overlay) overlay.hidden = true
  }

  function onOpen(cb) { onOpenCb = cb }

  async function init() {
    await load()
  }

  return { init, add, remove, clear, getAll, open, close, onOpen }
})()
