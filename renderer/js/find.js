/**
 * find.js — Floating find/replace overlay (replaces CodeMirror's prompt dialog)
 */
const FindManager = (() => {
  let panel, input, replaceInput, replaceRow, countEl
  let optCase, optWord, optRegex
  let cm = null
  let visible = false
  let replaceMode = false
  let marks = []
  let curIdx = -1

  function init() {
    panel = document.getElementById('find-panel')
    input = document.getElementById('find-input')
    replaceInput = document.getElementById('replace-input')
    replaceRow = panel.querySelector('.find-replace-row')
    countEl = document.getElementById('find-count')
    optCase = document.getElementById('find-opt-case')
    optWord = document.getElementById('find-opt-word')
    optRegex = document.getElementById('find-opt-regex')

    cm = window.EditorManager && EditorManager.getCM && EditorManager.getCM()

    document.getElementById('find-prev').addEventListener('click', () => step(-1))
    document.getElementById('find-next').addEventListener('click', () => step(1))
    document.getElementById('find-close').addEventListener('click', hide)
    document.getElementById('find-toggle-replace').addEventListener('click', toggleReplace)
    document.getElementById('replace-one').addEventListener('click', replaceCurrent)
    document.getElementById('replace-all').addEventListener('click', replaceAll)

    ;[optCase, optWord, optRegex].forEach(b => {
      b.addEventListener('click', () => {
        b.classList.toggle('active')
        refresh()
      })
    })

    input.addEventListener('input', refresh)
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1) }
      else if (e.key === 'Escape') { e.preventDefault(); hide() }
      else if (e.altKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); optCase.click() }
      else if (e.altKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); optWord.click() }
      else if (e.altKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); optRegex.click() }
    })
    replaceInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); replaceCurrent() }
      else if (e.key === 'Escape') { e.preventDefault(); hide() }
    })

    // Global shortcuts
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'f') {
        e.preventDefault()
        show(false)
      } else if (ctrl && e.key === 'h') {
        e.preventDefault()
        show(true)
      }
    })
  }

  function show(withReplace) {
    if (!cm) cm = EditorManager.getCM()
    visible = true
    panel.hidden = false
    setReplaceMode(!!withReplace)
    // Pre-fill with current selection
    const sel = cm && cm.getSelection()
    if (sel && sel.length > 0 && sel.length < 200) input.value = sel
    input.focus()
    input.select()
    refresh()
  }

  function hide() {
    visible = false
    panel.hidden = true
    clearMarks()
    if (cm) cm.focus()
  }

  function setReplaceMode(on) {
    replaceMode = on
    replaceRow.hidden = !on
    document.getElementById('find-toggle-replace').classList.toggle('active', on)
  }
  function toggleReplace() { setReplaceMode(!replaceMode) }

  function clearMarks() {
    marks.forEach(m => m.clear())
    marks = []
    curIdx = -1
    if (countEl) countEl.textContent = ''
  }

  function buildQuery() {
    const q = input.value
    if (!q) return null
    const useRegex = optRegex.classList.contains('active')
    const useCase = optCase.classList.contains('active')
    const useWord = optWord.classList.contains('active')
    try {
      let pattern = useRegex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (useWord) pattern = `\\b${pattern}\\b`
      return new RegExp(pattern, useCase ? 'g' : 'gi')
    } catch { return null }
  }

  function refresh() {
    if (!cm) return
    clearMarks()
    const re = buildQuery()
    if (!re) return
    const cursor = cm.getSearchCursor(re, { line: 0, ch: 0 }, { caseFold: !optCase.classList.contains('active') })
    while (cursor.findNext()) {
      const from = cursor.from(), to = cursor.to()
      if (from.line === to.line && from.ch === to.ch) break // empty match safety
      marks.push(cm.markText(from, to, { className: 'cm-find-match' }))
    }
    if (marks.length === 0) {
      countEl.textContent = '无匹配'
      return
    }
    // Pick the match nearest to (and at/after) current cursor
    const cur = cm.getCursor()
    let idx = marks.findIndex(m => {
      const r = m.find(); if (!r) return false
      return r.from.line > cur.line || (r.from.line === cur.line && r.from.ch >= cur.ch)
    })
    if (idx === -1) idx = 0
    setActiveMatch(idx)
  }

  function setActiveMatch(idx) {
    if (marks.length === 0) return
    if (curIdx >= 0 && marks[curIdx]) {
      const r = marks[curIdx].find()
      if (r) {
        marks[curIdx].clear()
        marks[curIdx] = cm.markText(r.from, r.to, { className: 'cm-find-match' })
      }
    }
    curIdx = (idx + marks.length) % marks.length
    const r = marks[curIdx].find()
    if (r) {
      marks[curIdx].clear()
      marks[curIdx] = cm.markText(r.from, r.to, { className: 'cm-find-match cm-find-current' })
      cm.setSelection(r.from, r.to)
      cm.scrollIntoView({ from: r.from, to: r.to }, 80)
    }
    countEl.textContent = `${curIdx + 1} / ${marks.length}`
  }

  function step(dir) {
    if (marks.length === 0) { refresh(); return }
    setActiveMatch(curIdx + dir)
  }

  function replaceCurrent() {
    if (!cm || marks.length === 0 || curIdx < 0) return
    const r = marks[curIdx].find()
    if (!r) return
    cm.replaceRange(replaceInput.value, r.from, r.to)
    refresh()
  }

  function replaceAll() {
    if (!cm) return
    const re = buildQuery()
    if (!re) return
    const text = cm.getValue()
    const replaced = text.replace(re, replaceInput.value)
    if (replaced !== text) {
      cm.operation(() => {
        cm.setValue(replaced)
      })
      // Notify modification
      const cb = cm._handlers && cm._handlers.change
      // also trigger normal change handlers via setValue (already triggers 'change')
    }
    refresh()
  }

  return { init, show, hide, isVisible: () => visible }
})()
