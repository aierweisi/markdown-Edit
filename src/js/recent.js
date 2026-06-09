window.RecentFiles = (() => {
  let files = [],
    overlayEl = null,
    listEl = null,
    searchEl = null,
    activeIndex = 0,
    onOpenCallback = null

  async function saveStore() {
    await window.api.storeSet('recentFiles', files)
  }

  async function removeByPath(path) {
    files = files.filter(f => f.path !== path)
    await saveStore()
  }

  async function clearAll() {
    files = []
    await saveStore()
  }

  function scrollToActive() {
    const items = listEl.querySelectorAll('.recent-item')
    items.forEach((el, idx) => el.classList.toggle('active', idx === activeIndex))
    const active = items[activeIndex]
    active && active.scrollIntoView({ block: 'nearest' })
  }

  function fuzzyMatch(text, query) {
    if (!query) return !0
    const lowerText = text.toLowerCase(),
      lowerQuery = query.toLowerCase()
    let pos = 0
    for (const ch of lowerQuery) {
      const found = lowerText.indexOf(ch, pos)
      if (found < 0) return !1
      pos = found + 1
    }
    return !0
  }

  function renderList(query) {
    const trimmed = (query || '').trim(),
      filtered = files.filter(
        f => fuzzyMatch(f.path.split(/[/\\]/).pop(), trimmed) || fuzzyMatch(f.path, trimmed),
      )
    if (0 !== filtered.length) {
      listEl.innerHTML = filtered
        .map((f, idx) => {
          const name = f.path.split(/[/\\]/).pop(),
            dir = f.path.slice(0, f.path.length - name.length).replace(/[\\/]$/, '')
          return `\n        <div class="recent-item ${idx === activeIndex ? 'active' : ''}" data-path="${escHtml(f.path)}">\n          <div class="recent-item-main">\n            <div class="recent-item-name">${escHtml(name)}</div>\n            <div class="recent-item-path">${escHtml(dir)}</div>\n          </div>\n          <div class="recent-item-meta">${(function (ts) {
            if (!ts) return ''
            const date = new Date(ts),
              now = new Date()
            if (date.toDateString() === now.toDateString()) return date.toTimeString().slice(0, 5)
            const days = Math.floor((now - date) / 864e5)
            return days < 7 ? `${days} 天前` : date.toISOString().slice(0, 10)
          })(f.ts)}</div>\n          <button class="recent-item-remove" title="移除" data-remove="${escHtml(f.path)}">✕</button>\n        </div>\n      `
        })
        .join('')
      listEl.querySelectorAll('.recent-item').forEach(el => {
        el.addEventListener('click', evt => {
          evt.target.closest('.recent-item-remove') || openFileByPath(el.dataset.path)
        })
      })
      listEl.querySelectorAll('.recent-item-remove').forEach(btn => {
        btn.addEventListener('click', async evt => {
          evt.stopPropagation()
          await removeByPath(btn.dataset.remove)
          renderList(searchEl.value)
        })
      })
    } else
      listEl.innerHTML = `<div class="recent-empty">${0 === files.length ? '暂无最近文件' : '无匹配项'}</div>`
  }

  async function openFileByPath(path) {
    close()
    onOpenCallback && (await onOpenCallback(path))
  }

  function close() {
    overlayEl && (overlayEl.hidden = !0)
  }

  return {
    init: async function () {
      const stored = await window.api.storeGet('recentFiles')
      files = Array.isArray(stored) ? stored : []
    },
    add: async function (path) {
      if (!path) return
      files = files.filter(f => f.path !== path)
      files.unshift({ path: path, ts: Date.now() })
      files.length > 15 && (files = files.slice(0, 15))
      await saveStore()
    },
    remove: removeByPath,
    clear: clearAll,
    getAll: function () {
      return files.slice()
    },
    open: function () {
      if (!overlayEl) {
        overlayEl = document.createElement('div')
        overlayEl.className = 'recent-overlay'
        overlayEl.id = 'recent-overlay'
        overlayEl.hidden = !0
        overlayEl.innerHTML =
          '\n      <div class="recent-modal" role="dialog" aria-label="最近文件">\n        <div class="recent-header">\n          <input type="text" class="recent-search" id="recent-search" placeholder="搜索最近文件..." spellcheck="false">\n          <button class="recent-clear" id="recent-clear" title="清空列表">清空</button>\n        </div>\n        <div class="recent-list" id="recent-list"></div>\n      </div>\n    '
        document.body.appendChild(overlayEl)
        listEl = overlayEl.querySelector('#recent-list')
        searchEl = overlayEl.querySelector('#recent-search')
        overlayEl.addEventListener('click', evt => {
          evt.target === overlayEl && close()
        })
        overlayEl.querySelector('#recent-clear').addEventListener('click', async evt => {
          evt.stopPropagation()
          ;(await window.showConfirm('清空最近文件列表?', {
            title: '清空最近文件',
            okText: '清空',
            danger: !0,
          })) && (await clearAll(), renderList(''))
        })
        searchEl.addEventListener('input', () => {
          activeIndex = 0
          renderList(searchEl.value)
        })
        searchEl.addEventListener('keydown', evt => {
          const items = listEl.querySelectorAll('.recent-item')
          if ('Escape' === evt.key) evt.preventDefault(), close()
          else if ('ArrowDown' === evt.key)
            evt.preventDefault(), (activeIndex = Math.min(items.length - 1, activeIndex + 1)), scrollToActive()
          else if ('ArrowUp' === evt.key)
            evt.preventDefault(), (activeIndex = Math.max(0, activeIndex - 1)), scrollToActive()
          else if ('Enter' === evt.key) {
            evt.preventDefault()
            const active = items[activeIndex]
            active && openFileByPath(active.dataset.path)
          }
        })
      }
      overlayEl.hidden = !1
      activeIndex = 0
      searchEl.value = ''
      renderList('')
      setTimeout(() => searchEl.focus(), 0)
    },
    close: close,
    onOpen: function (cb) {
      onOpenCallback = cb
    },
  }
})()
