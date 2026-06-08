window.RecentFiles = (() => {
  let e = [],
    t = null,
    n = null,
    a = null,
    i = 0,
    r = null
  async function c() {
    await window.api.storeSet('recentFiles', e)
  }
  async function l(t) {
    ((e = e.filter(e => e.path !== t)), await c())
  }
  async function o() {
    ((e = []), await c())
  }
  function s() {
    const e = n.querySelectorAll('.recent-item')
    e.forEach((e, t) => e.classList.toggle('active', t === i))
    const t = e[i]
    t && t.scrollIntoView({ block: 'nearest' })
  }
  function d(e, t) {
    if (!t) return !0
    const n = e.toLowerCase(),
      a = t.toLowerCase()
    let i = 0
    for (const e of a) {
      const t = n.indexOf(e, i)
      if (t < 0) return !1
      i = t + 1
    }
    return !0
  }
  function u(t) {
    const r = (t || '').trim(),
      c = e.filter(e => d(e.path.split(/[/\\]/).pop(), r) || d(e.path, r))
    0 !== c.length
      ? ((n.innerHTML = c
          .map((e, t) => {
            const n = e.path.split(/[/\\]/).pop(),
              a = e.path.slice(0, e.path.length - n.length).replace(/[\\/]$/, '')
            return `\n        <div class="recent-item ${t === i ? 'active' : ''}" data-path="${f(e.path)}">\n          <div class="recent-item-main">\n            <div class="recent-item-name">${p(n)}</div>\n            <div class="recent-item-path">${p(a)}</div>\n          </div>\n          <div class="recent-item-meta">${(function (
              e,
            ) {
              if (!e) return ''
              const t = new Date(e),
                n = new Date()
              if (t.toDateString() === n.toDateString()) return t.toTimeString().slice(0, 5)
              const a = Math.floor((n - t) / 864e5)
              return a < 7 ? `${a} 天前` : t.toISOString().slice(0, 10)
            })(
              e.ts,
            )}</div>\n          <button class="recent-item-remove" title="移除" data-remove="${f(e.path)}">✕</button>\n        </div>\n      `
          })
          .join('')),
        n.querySelectorAll('.recent-item').forEach(e => {
          e.addEventListener('click', t => {
            t.target.closest('.recent-item-remove') || v(e.dataset.path)
          })
        }),
        n.querySelectorAll('.recent-item-remove').forEach(e => {
          e.addEventListener('click', async t => {
            (t.stopPropagation(), await l(e.dataset.remove), u(a.value))
          })
        }))
      : (n.innerHTML = `<div class="recent-empty">${0 === e.length ? '暂无最近文件' : '无匹配项'}</div>`)
  }
  function p(e) {
    return escHtml(e)
  }
  function f(e) {
    return escHtml(e)
  }
  async function v(e) {
    (h(), r && (await r(e)))
  }
  function h() {
    t && (t.hidden = !0)
  }
  return {
    init: async function () {
      await (async function () {
        const t = await window.api.storeGet('recentFiles')
        return ((e = Array.isArray(t) ? t : []), e)
      })()
    },
    add: async function (t) {
      t &&
        ((e = e.filter(e => e.path !== t)),
        e.unshift({ path: t, ts: Date.now() }),
        e.length > 15 && (e = e.slice(0, 15)),
        await c())
    },
    remove: l,
    clear: o,
    getAll: function () {
      return e.slice()
    },
    open: function () {
      (t ||
        ((t = document.createElement('div')),
        (t.className = 'recent-overlay'),
        (t.id = 'recent-overlay'),
        (t.hidden = !0),
        (t.innerHTML =
          '\n      <div class="recent-modal" role="dialog" aria-label="最近文件">\n        <div class="recent-header">\n          <input type="text" class="recent-search" id="recent-search" placeholder="搜索最近文件..." spellcheck="false">\n          <button class="recent-clear" id="recent-clear" title="清空列表">清空</button>\n        </div>\n        <div class="recent-list" id="recent-list"></div>\n      </div>\n    '),
        document.body.appendChild(t),
        (n = t.querySelector('#recent-list')),
        (a = t.querySelector('#recent-search')),
        t.addEventListener('click', e => {
          e.target === t && h()
        }),
        t.querySelector('#recent-clear').addEventListener('click', async e => {
          (e.stopPropagation(),
            (await window.showConfirm('清空最近文件列表?', {
              title: '清空最近文件',
              okText: '清空',
              danger: !0,
            })) && (await o(), u('')))
        }),
        a.addEventListener('input', () => {
          ((i = 0), u(a.value))
        }),
        a.addEventListener('keydown', e => {
          const t = n.querySelectorAll('.recent-item')
          if ('Escape' === e.key) (e.preventDefault(), h())
          else if ('ArrowDown' === e.key)
            (e.preventDefault(), (i = Math.min(t.length - 1, i + 1)), s())
          else if ('ArrowUp' === e.key) (e.preventDefault(), (i = Math.max(0, i - 1)), s())
          else if ('Enter' === e.key) {
            e.preventDefault()
            const n = t[i]
            n && v(n.dataset.path)
          }
        })),
        (t.hidden = !1),
        (i = 0),
        (a.value = ''),
        u(''),
        setTimeout(() => a.focus(), 0))
    },
    close: h,
    onOpen: function (e) {
      r = e
    },
  }
})()
