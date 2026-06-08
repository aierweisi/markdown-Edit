window.FindManager = (() => {
  let e,
    t,
    n,
    i,
    c,
    o,
    l,
    r,
    a = null,
    s = !1,
    d = !1,
    u = [],
    f = -1
  function m(n) {
    (a || (a = EditorManager.getCM()),
      (s = !0),
      e.classList.remove('closing'),
      e.classList.add('open'),
      v(!!n))
    const i = a && a.getSelection()
    ;(i && i.length > 0 && i.length < 200 && (t.value = i), t.focus(), t.select(), p())
  }
  function g() {
    ((s = !1),
      e.classList.remove('open'),
      e.classList.add('closing'),
      setTimeout(() => e.classList.remove('closing'), 200),
      h(),
      a && a.focus())
  }
  function v(e) {
    ((d = e),
      (i.hidden = !e),
      document.getElementById('find-toggle-replace').classList.toggle('active', e))
  }
  function y() {
    v(!d)
  }
  function h() {
    (u.forEach(e => e.clear()), (u = []), (f = -1), c && (c.textContent = ''))
  }
  function E() {
    const e = t.value
    if (!e) return null
    const n = r.classList.contains('active'),
      i = o.classList.contains('active'),
      c = l.classList.contains('active')
    try {
      let t = n ? e : e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return (c && (t = `\\b${t}\\b`), new RegExp(t, i ? 'g' : 'gi'))
    } catch {
      return null
    }
  }
  function p() {
    if (!a) return
    h()
    const e = E()
    if (!e) return
    const t = a.getSearchCursor(
      e,
      { line: 0, ch: 0 },
      { caseFold: !o.classList.contains('active') },
    )
    for (; t.findNext(); ) {
      const e = t.from(),
        n = t.to()
      if (e.line === n.line && e.ch === n.ch) break
      u.push(a.markText(e, n, { className: 'cm-find-match' }))
    }
    if (0 === u.length) return void (c.textContent = '无匹配')
    const n = a.getCursor()
    let i = u.findIndex(e => {
      const t = e.find()
      return !!t && (t.from.line > n.line || (t.from.line === n.line && t.from.ch >= n.ch))
    })
    ;(-1 === i && (i = 0), k(i))
  }
  function k(e) {
    if (0 === u.length) return
    if (f >= 0 && u[f]) {
      const e = u[f].find()
      e && (u[f].clear(), (u[f] = a.markText(e.from, e.to, { className: 'cm-find-match' })))
    }
    f = (e + u.length) % u.length
    const i = u[f].find()
    if (i) {
      (u[f].clear(),
        (u[f] = a.markText(i.from, i.to, { className: 'cm-find-match cm-find-current' })))
      const e = document.activeElement === t || document.activeElement === n
      if (
        (a.setSelection(i.from, i.to, { scroll: !1 }),
        a.scrollIntoView({ from: i.from, to: i.to }, 80),
        e)
      ) {
        const e = document.activeElement
        requestAnimationFrame(() => {
          s && e && e.focus && e.focus()
        })
      }
    }
    c.textContent = `${f + 1} / ${u.length}`
  }
  function L(e) {
    0 !== u.length ? k(f + e) : p()
  }
  function I() {
    if (!a || 0 === u.length || f < 0) return
    const e = u[f].find()
    e && (a.replaceRange(n.value, e.from, e.to), p())
  }
  function B() {
    if (!a) return
    const e = E()
    if (!e) return
    const t = a.getValue(),
      i = t.replace(e, n.value)
    if (i === t) return void p()
    const c = a.getScrollInfo().top,
      o = a.getCursor()
    a.operation(() => {
      const e = a.lastLine(),
        t = a.getLine(e).length
      a.replaceRange(i, { line: 0, ch: 0 }, { line: e, ch: t })
    })
    const l = a.lastLine(),
      r = Math.min(o.line, l),
      s = a.getLine(r).length
    ;(a.setCursor({ line: r, ch: Math.min(o.ch, s) }), a.scrollTo(null, c), p())
  }
  return {
    init: function () {
      e ||
        ((e = document.getElementById('find-panel')),
        (t = document.getElementById('find-input')),
        (n = document.getElementById('replace-input')),
        (i = e.querySelector('.find-replace-row')),
        (c = document.getElementById('find-count')),
        (o = document.getElementById('find-opt-case')),
        (l = document.getElementById('find-opt-word')),
        (r = document.getElementById('find-opt-regex')),
        (a = window.EditorManager && EditorManager.getCM && EditorManager.getCM()),
        document.getElementById('find-prev').addEventListener('click', () => L(-1)),
        document.getElementById('find-next').addEventListener('click', () => L(1)),
        document.getElementById('find-close').addEventListener('click', g),
        document.getElementById('find-toggle-replace').addEventListener('click', y),
        document.getElementById('replace-one').addEventListener('click', I),
        document.getElementById('replace-all').addEventListener('click', B),
        [o, l, r].forEach(e => {
          e.addEventListener('click', () => {
            (e.classList.toggle('active'), p())
          })
        }),
        t.addEventListener('input', p),
        t.addEventListener('keydown', e => {
          'Enter' === e.key
            ? (e.preventDefault(), L(e.shiftKey ? -1 : 1))
            : 'Escape' === e.key
              ? (e.preventDefault(), g())
              : !e.altKey || ('c' !== e.key && 'C' !== e.key)
                ? !e.altKey || ('w' !== e.key && 'W' !== e.key)
                  ? !e.altKey || ('r' !== e.key && 'R' !== e.key) || (e.preventDefault(), r.click())
                  : (e.preventDefault(), l.click())
                : (e.preventDefault(), o.click())
        }),
        n.addEventListener('keydown', e => {
          'Enter' === e.key
            ? (e.preventDefault(), I())
            : 'Escape' === e.key && (e.preventDefault(), g())
        }),
        document.addEventListener(
          'keydown',
          e => {
            const i = e.ctrlKey || e.metaKey
            if (i && 'f' === e.key) return (e.preventDefault(), void m(!1))
            if (i && 'h' === e.key) return (e.preventDefault(), void m(!0))
            if (s && ('F3' === e.key || (i && ('g' === e.key || 'G' === e.key))))
              return (e.preventDefault(), void L(e.shiftKey ? -1 : 1))
            if (s && 'Enter' === e.key && u.length > 0) {
              const i = document.activeElement
              if (i === t || i === n) return
              a &&
                (function () {
                  if (!a || 0 === u.length) return !1
                  const e = a.getCursor()
                  return u.some(t => {
                    const n = t.find()
                    let i, c, o
                    return !(
                      !n ||
                      ((i = e),
                      (c = n.from),
                      (o = n.to),
                      i.line < c.line ||
                        i.line > o.line ||
                        (i.line === c.line && i.ch < c.ch) ||
                        (i.line === o.line && i.ch > o.ch))
                    )
                  })
                })() &&
                (e.preventDefault(), e.stopPropagation(), L(e.shiftKey ? -1 : 1))
            }
          },
          !0,
        ))
    },
    show: m,
    hide: g,
    isVisible: () => s,
  }
})()
!(function () {
  let e = !1
  const t = () => {
    if (!e)
      try {
        (FindManager.init(), (e = !0))
      } catch (e) {
        console.error('[FindManager] init failed:', e)
      }
  }
  'loading' === document.readyState
    ? document.addEventListener('DOMContentLoaded', t, { once: !0 })
    : setTimeout(t, 0)
})()
