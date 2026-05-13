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
    if (panel) return  // 幂等：已初始化则跳过，避免重复绑定
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
        return
      }
      if (ctrl && e.key === 'h') {
        e.preventDefault()
        show(true)
        return
      }
      // F3 / Shift+F3 / Ctrl+G: 跳转下一个/上一个匹配，不需要焦点在输入框
      if (visible && (e.key === 'F3' || (ctrl && (e.key === 'g' || e.key === 'G')))) {
        e.preventDefault()
        step(e.shiftKey ? -1 : 1)
        return
      }
      // 当查找面板可见且光标停在某个匹配上时，回车跳到下一个
      // （即使焦点在编辑器里）。Shift+Enter = 上一个。
      if (visible && e.key === 'Enter' && marks.length > 0) {
        const ae = document.activeElement
        const inFindUI = ae === input || ae === replaceInput
        if (inFindUI) return  // 输入框自己的 keydown 已处理
        if (cm && isCursorInsideMatch()) {
          e.preventDefault()
          e.stopPropagation()
          step(e.shiftKey ? -1 : 1)
        }
      }
    }, true)
  }

  // 判断当前 CodeMirror 光标是否落在某个匹配区间内
  function isCursorInsideMatch() {
    if (!cm || marks.length === 0) return false
    const cur = cm.getCursor()
    const inSide = (p, from, to) => {
      if (p.line < from.line || p.line > to.line) return false
      if (p.line === from.line && p.ch < from.ch) return false
      if (p.line === to.line && p.ch > to.ch) return false
      return true
    }
    return marks.some(m => {
      const r = m.find(); if (!r) return false
      return inSide(cur, r.from, r.to)
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
      // 把光标移到匹配处但不抢焦点（CM5 的 setSelection 默认会聚焦编辑器，
      // 导致查找输入框失焦，看起来像是"弹框关闭了"）。
      // 这里手动定位 + 滚动可见，保持焦点在 find 输入框。
      const wasFindFocused = document.activeElement === input || document.activeElement === replaceInput
      cm.setSelection(r.from, r.to, { scroll: false })
      cm.scrollIntoView({ from: r.from, to: r.to }, 80)
      if (wasFindFocused) {
        // CM 内部聚焦是异步的，下一帧把焦点抢回来
        const ae = document.activeElement
        requestAnimationFrame(() => {
          if (visible && ae && ae.focus) ae.focus()
        })
      }
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
    if (replaced === text) { refresh(); return }

    // 保存光标和滚动位置，替换后恢复
    const savedScroll = cm.getScrollInfo().top
    const savedCursor = cm.getCursor()

    cm.operation(() => {
      const lastLine = cm.lastLine()
      const lastCh = cm.getLine(lastLine).length
      // 用 replaceRange 保留撤销栈（cm.setValue 会清掉光标且产生不可撤销操作）
      cm.replaceRange(replaced, { line: 0, ch: 0 }, { line: lastLine, ch: lastCh })
    })

    // 把光标限制在新文档范围内
    const newLastLine = cm.lastLine()
    const safeLine = Math.min(savedCursor.line, newLastLine)
    const safeLineLen = cm.getLine(safeLine).length
    cm.setCursor({ line: safeLine, ch: Math.min(savedCursor.ch, safeLineLen) })
    cm.scrollTo(null, savedScroll)

    refresh()
  }

  return { init, show, hide, isVisible: () => visible }
})()

// 自动初始化兜底：避免依赖 app.js 的初始化顺序失败导致 FindManager 未启动
;(function autoInit() {
  let inited = false
  const safeInit = () => {
    if (inited) return
    try {
      FindManager.init()
      inited = true
    } catch (e) {
      console.error('[FindManager] init failed:', e)
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeInit, { once: true })
  } else {
    setTimeout(safeInit, 0)
  }
})()
