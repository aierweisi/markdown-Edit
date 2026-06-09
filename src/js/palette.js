window.CommandPalette = (() => {
  let overlayEl = null,
    inputEl = null,
    listEl = null,
    activeIndex = 0
  const commands = []

  function fuzzyScore(query, target) {
    if (!target) return 0
    const lowerQuery = query.toLowerCase(),
      lowerTarget = target.toLowerCase()
    if (lowerTarget.includes(lowerQuery)) return 100 - lowerTarget.indexOf(lowerQuery)
    let matchedPos = 0,
      score = 0
    for (const ch of lowerQuery) {
      const pos = lowerTarget.indexOf(ch, matchedPos)
      if (pos < 0) return -1
      score += 10 - Math.min(10, pos - matchedPos)
      matchedPos = pos + 1
    }
    return score
  }

  function scrollToActive() {
    const items = listEl.querySelectorAll('.palette-item')
    items.forEach((el, idx) => el.classList.toggle('active', idx === activeIndex))
    const active = items[activeIndex]
    active && active.scrollIntoView({ block: 'nearest' })
  }

  function escapeHtml(text) {
    return escHtml(text)
  }

  function renderList(query) {
    const trimmed = (query || '').trim()
    const results = trimmed
      ? commands
          .map(cmd => ({ cmd, score: fuzzyScore(cmd.title + ' ' + (cmd.group || ''), trimmed) }))
          .filter(r => r.score >= 0)
          .sort((a, b) => b.score - a.score)
      : commands.map(cmd => ({ cmd, score: 0 }))
    if (0 !== results.length) {
      listEl.innerHTML = results
        .map((r, idx) => {
          const cmd = r.cmd
          return `\n        <div class="palette-item ${idx === activeIndex ? 'active' : ''}" data-id="${escapeHtml(cmd.id)}">\n          <div class="palette-item-main">\n            <span class="palette-item-group">${escapeHtml(cmd.group || '')}</span>\n            <span class="palette-item-title">${escapeHtml(cmd.title)}</span>\n          </div>\n          ${cmd.hint ? `<span class="palette-item-hint">${escapeHtml(cmd.hint)}</span>` : ''}\n        </div>\n      `
        })
        .join('')
      listEl.querySelectorAll('.palette-item').forEach(el => {
        el.addEventListener('click', () => executeCommand(el.dataset.id))
      })
    } else listEl.innerHTML = '<div class="palette-empty">无匹配命令</div>'
  }

  function executeCommand(id) {
    const cmd = commands.find(c => c.id === id)
    if (cmd) {
      close()
      try {
        cmd.run()
      } catch (err) {
        console.error('palette command failed:', err)
      }
    }
  }

  function close() {
    overlayEl && (overlayEl.hidden = !0)
  }

  return {
    register: function (cmd) {
      commands.push(cmd)
    },
    open: function () {
      if (!overlayEl) {
        overlayEl = document.createElement('div')
        overlayEl.className = 'palette-overlay'
        overlayEl.id = 'palette-overlay'
        overlayEl.hidden = !0
        overlayEl.innerHTML =
          '\n      <div class="palette-modal" role="dialog" aria-label="命令面板">\n        <input type="text" class="palette-input" id="palette-input" placeholder="输入命令..." spellcheck="false">\n        <div class="palette-list" id="palette-list"></div>\n      </div>\n    '
        document.body.appendChild(overlayEl)
        listEl = overlayEl.querySelector('#palette-list')
        inputEl = overlayEl.querySelector('#palette-input')
        overlayEl.addEventListener('click', evt => {
          evt.target === overlayEl && close()
        })
        inputEl.addEventListener('input', () => {
          activeIndex = 0
          renderList(inputEl.value)
        })
        inputEl.addEventListener('keydown', evt => {
          const items = listEl.querySelectorAll('.palette-item')
          if ('Escape' === evt.key) evt.preventDefault(), close()
          else if ('ArrowDown' === evt.key)
            evt.preventDefault(), (activeIndex = Math.min(items.length - 1, activeIndex + 1)), scrollToActive()
          else if ('ArrowUp' === evt.key)
            evt.preventDefault(), (activeIndex = Math.max(0, activeIndex - 1)), scrollToActive()
          else if ('Enter' === evt.key) {
            evt.preventDefault()
            const active = items[activeIndex]
            active && executeCommand(active.dataset.id)
          }
        })
      }
      overlayEl.hidden = !1
      activeIndex = 0
      inputEl.value = ''
      renderList('')
      setTimeout(() => inputEl.focus(), 0)
    },
    close: close,
  }
})()
