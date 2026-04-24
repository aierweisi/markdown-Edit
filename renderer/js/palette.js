/**
 * palette.js — Command palette (Ctrl+Shift+P)
 */

const CommandPalette = (() => {
  let overlay = null
  let input = null
  let list = null
  let commands = []
  let selectedIdx = 0

  function register(cmd) {
    // cmd: { id, title, hint, group, run }
    commands.push(cmd)
  }

  function fuzzyMatch(text, query) {
    if (!query) return 0
    const t = text.toLowerCase()
    const q = query.toLowerCase()
    if (t.includes(q)) return 100 - t.indexOf(q)
    let ti = 0, score = 0
    for (const ch of q) {
      const idx = t.indexOf(ch, ti)
      if (idx < 0) return -1
      score += 10 - Math.min(10, idx - ti)
      ti = idx + 1
    }
    return score
  }

  function buildUI() {
    if (overlay) return
    overlay = document.createElement('div')
    overlay.className = 'palette-overlay'
    overlay.id = 'palette-overlay'
    overlay.hidden = true
    overlay.innerHTML = `
      <div class="palette-modal" role="dialog" aria-label="命令面板">
        <input type="text" class="palette-input" id="palette-input" placeholder="输入命令..." spellcheck="false">
        <div class="palette-list" id="palette-list"></div>
      </div>
    `
    document.body.appendChild(overlay)

    list = overlay.querySelector('#palette-list')
    input = overlay.querySelector('#palette-input')

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
    input.addEventListener('input', () => { selectedIdx = 0; render(input.value) })
    input.addEventListener('keydown', (e) => {
      const visible = list.querySelectorAll('.palette-item')
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(visible.length - 1, selectedIdx + 1); updateSelection() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); updateSelection() }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const el = visible[selectedIdx]
        if (el) execById(el.dataset.id)
      }
    })
  }

  function updateSelection() {
    const visible = list.querySelectorAll('.palette-item')
    visible.forEach((el, i) => el.classList.toggle('active', i === selectedIdx))
    const cur = visible[selectedIdx]
    if (cur) cur.scrollIntoView({ block: 'nearest' })
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  function render(query) {
    const q = (query || '').trim()
    let filtered
    if (!q) {
      filtered = commands.map(c => ({ cmd: c, score: 0 }))
    } else {
      filtered = commands
        .map(c => ({ cmd: c, score: fuzzyMatch(c.title + ' ' + (c.group || ''), q) }))
        .filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score)
    }
    if (filtered.length === 0) {
      list.innerHTML = `<div class="palette-empty">无匹配命令</div>`
      return
    }
    list.innerHTML = filtered.map((x, i) => {
      const c = x.cmd
      return `
        <div class="palette-item ${i === selectedIdx ? 'active' : ''}" data-id="${escapeHtml(c.id)}">
          <div class="palette-item-main">
            <span class="palette-item-group">${escapeHtml(c.group || '')}</span>
            <span class="palette-item-title">${escapeHtml(c.title)}</span>
          </div>
          ${c.hint ? `<span class="palette-item-hint">${escapeHtml(c.hint)}</span>` : ''}
        </div>
      `
    }).join('')
    list.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => execById(el.dataset.id))
    })
  }

  function execById(id) {
    const c = commands.find(x => x.id === id)
    if (!c) return
    close()
    try { c.run() } catch (e) { console.error('palette command failed:', e) }
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

  return { register, open, close }
})()
