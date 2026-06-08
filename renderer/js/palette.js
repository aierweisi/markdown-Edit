window.CommandPalette = (() => {
  let e = null, t = null, n = null, i = 0
  const l = []
  function a(e, t) {
    if (!t) return 0
    const n = e.toLowerCase(),
      l = t.toLowerCase()
    if (n.includes(l)) return 100 - n.indexOf(l)
    let i = 0,
      a = 0
    for (const e of l) {
      const t = n.indexOf(e, i)
      if (t < 0) return -1
      ;((a += 10 - Math.min(10, t - i)), (i = t + 1))
    }
    return a
  }
  function r() {
    const e = n.querySelectorAll('.palette-item')
    e.forEach((e, t) => e.classList.toggle('active', t === i))
    const t = e[i]
    t && t.scrollIntoView({ block: 'nearest' })
  }
  function s(e) {
    return escHtml(e)
  }
  function o(e) {
    const t = (e || '').trim()
    let r
    ;((r = t
      ? l
          .map(e => ({ cmd: e, score: a(e.title + ' ' + (e.group || ''), t) }))
          .filter(e => e.score >= 0)
          .sort((e, t) => t.score - e.score)
      : l.map(e => ({ cmd: e, score: 0 }))),
      0 !== r.length
        ? ((n.innerHTML = r
            .map((e, t) => {
              const n = e.cmd
              return `\n        <div class="palette-item ${t === i ? 'active' : ''}" data-id="${s(n.id)}">\n          <div class="palette-item-main">\n            <span class="palette-item-group">${s(n.group || '')}</span>\n            <span class="palette-item-title">${s(n.title)}</span>\n          </div>\n          ${n.hint ? `<span class="palette-item-hint">${s(n.hint)}</span>` : ''}\n        </div>\n      `
            })
            .join('')),
          n.querySelectorAll('.palette-item').forEach(e => {
            e.addEventListener('click', () => c(e.dataset.id))
          }))
        : (n.innerHTML = '<div class="palette-empty">无匹配命令</div>'))
  }
  function c(e) {
    const t = l.find(t => t.id === e)
    if (t) {
      d()
      try {
        t.run()
      } catch (e) {
        console.error('palette command failed:', e)
      }
    }
  }
  function d() {
    e && (e.hidden = !0)
  }
  return {
    register: function (e) {
      l.push(e)
    },
    open: function () {
      (e ||
        ((e = document.createElement('div')),
        (e.className = 'palette-overlay'),
        (e.id = 'palette-overlay'),
        (e.hidden = !0),
        (e.innerHTML =
          '\n      <div class="palette-modal" role="dialog" aria-label="命令面板">\n        <input type="text" class="palette-input" id="palette-input" placeholder="输入命令..." spellcheck="false">\n        <div class="palette-list" id="palette-list"></div>\n      </div>\n    '),
        document.body.appendChild(e),
        (n = e.querySelector('#palette-list')),
        (t = e.querySelector('#palette-input')),
        e.addEventListener('click', t => {
          t.target === e && d()
        }),
        t.addEventListener('input', () => {
          ((i = 0), o(t.value))
        }),
        t.addEventListener('keydown', e => {
          const t = n.querySelectorAll('.palette-item')
          if ('Escape' === e.key) (e.preventDefault(), d())
          else if ('ArrowDown' === e.key)
            (e.preventDefault(), (i = Math.min(t.length - 1, i + 1)), r())
          else if ('ArrowUp' === e.key) (e.preventDefault(), (i = Math.max(0, i - 1)), r())
          else if ('Enter' === e.key) {
            e.preventDefault()
            const n = t[i]
            n && c(n.dataset.id)
          }
        })),
        (e.hidden = !1),
        (i = 0),
        (t.value = ''),
        o(''),
        setTimeout(() => t.focus(), 0))
    },
    close: d,
  }
})()
