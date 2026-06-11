window.FindManager = (() => {
  const FIND_SEL_MAX_LENGTH = 200  // 查找时自动填入的选中文本最大长度
  let panelEl,
    findInput,
    replaceInput,
    replaceRow,
    countEl,
    optCase,
    optWord,
    optRegex,
    cm = null,
    isOpen = !1,
    showReplace = !1,
    markers = [],
    currentIdx = -1

  function show(hasReplace) {
    cm || (cm = EditorManager.getCM())
    isOpen = !0
    panelEl.classList.remove('closing')
    panelEl.classList.add('open')
    setReplaceMode(!!hasReplace)
    const sel = cm && cm.getSelection()
    sel && sel.length > 0 && sel.length < FIND_SEL_MAX_LENGTH && (findInput.value = sel)
    findInput.focus()
    findInput.select()
    updateMatches()
  }

  function hide() {
    isOpen = !1
    panelEl.classList.remove('open')
    panelEl.classList.add('closing')
    setTimeout(() => panelEl.classList.remove('closing'), 200)
    clearMarkers()
    cm && cm.focus()
  }

  function setReplaceMode(enabled) {
    showReplace = enabled
    replaceRow.hidden = !enabled
    document.getElementById('find-toggle-replace').classList.toggle('active', enabled)
  }

  function toggleReplaceMode() {
    setReplaceMode(!showReplace)
  }

  function clearMarkers() {
    markers.forEach(m => m.clear())
    markers = []
    currentIdx = -1
    countEl && (countEl.textContent = '')
  }

  function buildRegex() {
    const query = findInput.value
    if (!query) return null
    const isRegex = optRegex.classList.contains('active'),
      isCaseSensitive = optCase.classList.contains('active'),
      isWholeWord = optWord.classList.contains('active')
    try {
      let pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      isWholeWord && (pattern = `\\b${pattern}\\b`)
      return new RegExp(pattern, isCaseSensitive ? 'g' : 'gi')
    } catch {
      return null
    }
  }

  function updateMatches() {
    if (!cm) return
    clearMarkers()
    const regex = buildRegex()
    if (!regex) return
    const cursor = cm.getSearchCursor(
      regex,
      { line: 0, ch: 0 },
      { caseFold: !optCase.classList.contains('active') },
    )
    for (; cursor.findNext(); ) {
      const from = cursor.from(),
        to = cursor.to()
      if (from.line === to.line && from.ch === to.ch) break
      markers.push(cm.markText(from, to, { className: 'cm-find-match' }))
    }
    if (0 === markers.length) return void (countEl.textContent = '无匹配')
    const curPos = cm.getCursor()
    let startIdx = markers.findIndex(m => {
      const range = m.find()
      return !!range && (range.from.line > curPos.line || (range.from.line === curPos.line && range.from.ch >= curPos.ch))
    })
    -1 === startIdx && (startIdx = 0)
    highlightMatch(startIdx)
  }

  function highlightMatch(idx) {
    if (0 === markers.length) return
    if (currentIdx >= 0 && markers[currentIdx]) {
      const range = markers[currentIdx].find()
      range && (markers[currentIdx].clear(), (markers[currentIdx] = cm.markText(range.from, range.to, { className: 'cm-find-match' })))
    }
    currentIdx = (idx + markers.length) % markers.length
    const range = markers[currentIdx].find()
    if (range) {
      markers[currentIdx].clear()
      markers[currentIdx] = cm.markText(range.from, range.to, { className: 'cm-find-match cm-find-current' })
      const focusInPanel = document.activeElement === findInput || document.activeElement === replaceInput
      if (
        (cm.setSelection(range.from, range.to, { scroll: !1 }),
        cm.scrollIntoView({ from: range.from, to: range.to }, 80),
        focusInPanel)
      ) {
        const activeEl = document.activeElement
        requestAnimationFrame(() => {
          isOpen && activeEl && activeEl.focus && activeEl.focus()
        })
      }
    }
    countEl.textContent = `${currentIdx + 1} / ${markers.length}`
  }

  function navigateMatches(step) {
    0 !== markers.length ? highlightMatch(currentIdx + step) : updateMatches()
  }

  function replaceOne() {
    if (!cm || 0 === markers.length || currentIdx < 0) return
    const range = markers[currentIdx].find()
    range && (cm.replaceRange(replaceInput.value, range.from, range.to), updateMatches())
  }

  function replaceAll() {
    if (!cm) return
    const regex = buildRegex()
    if (!regex) return
    const scrollTop = cm.getScrollInfo().top
    let count = 0
    cm.operation(() => {
      const cursor = cm.getSearchCursor(
        regex,
        { line: 0, ch: 0 },
        { caseFold: !optCase.classList.contains('active') },
      )
      for (; cursor.findNext(); ) cursor.replace(replaceInput.value), count++
    })
    if (0 === count) return void updateMatches()
    clearMarkers()
    updateMatches()
    cm.scrollTo(null, scrollTop)
  }

  return {
    init: function () {
      if (!panelEl) {
        panelEl = document.getElementById('find-panel')
        findInput = document.getElementById('find-input')
        replaceInput = document.getElementById('replace-input')
        replaceRow = panelEl.querySelector('.find-replace-row')
        countEl = document.getElementById('find-count')
        optCase = document.getElementById('find-opt-case')
        optWord = document.getElementById('find-opt-word')
        optRegex = document.getElementById('find-opt-regex')
        // 如果 CM 尚未就绪，延迟重试（最多重试 5 次，间隔 200ms）
        ;(function tryGetCM(tryCount) {
          cm = window.EditorManager && EditorManager.getCM && EditorManager.getCM()
          if (!cm && tryCount < 5) {
            setTimeout(function () { tryGetCM(tryCount + 1) }, 200)
          } else if (!cm) {
            console.warn('[FindManager] CodeMirror 实例获取失败，查找功能可能不完整')
          }
        })(0)
        document.getElementById('find-prev').addEventListener('click', () => navigateMatches(-1))
        document.getElementById('find-next').addEventListener('click', () => navigateMatches(1))
        document.getElementById('find-close').addEventListener('click', hide)
        document.getElementById('find-toggle-replace').addEventListener('click', toggleReplaceMode)
        document.getElementById('replace-one').addEventListener('click', replaceOne)
        document.getElementById('replace-all').addEventListener('click', replaceAll)
        ;[optCase, optWord, optRegex].forEach(btn => {
          btn.addEventListener('click', () => {
            btn.classList.toggle('active')
            updateMatches()
          })
        })
        findInput.addEventListener('input', updateMatches)
        findInput.addEventListener('keydown', evt => {
          'Enter' === evt.key
            ? (evt.preventDefault(), navigateMatches(evt.shiftKey ? -1 : 1))
            : 'Escape' === evt.key
              ? (evt.preventDefault(), hide())
              : !evt.altKey || ('c' !== evt.key && 'C' !== evt.key)
                ? !evt.altKey || ('w' !== evt.key && 'W' !== evt.key)
                  ? !evt.altKey || ('r' !== evt.key && 'R' !== evt.key) || (evt.preventDefault(), optRegex.click())
                  : (evt.preventDefault(), optWord.click())
                : (evt.preventDefault(), optCase.click())
        })
        replaceInput.addEventListener('keydown', evt => {
          'Enter' === evt.key
            ? (evt.preventDefault(), replaceOne())
            : 'Escape' === evt.key && (evt.preventDefault(), hide())
        })
        document.addEventListener(
          'keydown',
          evt => {
            const ctrl = evt.ctrlKey || evt.metaKey
            if (ctrl && 'f' === evt.key) return (evt.preventDefault(), void show(!1))
            if (ctrl && 'h' === evt.key) return (evt.preventDefault(), void show(!0))
            if (isOpen && ('F3' === evt.key || (ctrl && ('g' === evt.key || 'G' === evt.key))))
              return (evt.preventDefault(), void navigateMatches(evt.shiftKey ? -1 : 1))
            if (isOpen && 'Enter' === evt.key && markers.length > 0) {
              const activeEl = document.activeElement
              if (activeEl === findInput || activeEl === replaceInput) return
              cm &&
                (function () {
                  if (!cm || 0 === markers.length) return !1
                  const cursor = cm.getCursor()
                  return markers.some(m => {
                    const range = m.find()
                    let curPos, rangeFrom, rangeTo
                    return !(
                      !range ||
                      ((curPos = cursor),
                      (rangeFrom = range.from),
                      (rangeTo = range.to),
                      curPos.line < rangeFrom.line ||
                        curPos.line > rangeTo.line ||
                        (curPos.line === rangeFrom.line && curPos.ch < rangeFrom.ch) ||
                        (curPos.line === rangeTo.line && curPos.ch > rangeTo.ch))
                    )
                  })
                })() &&
                (evt.preventDefault(), evt.stopPropagation(), navigateMatches(evt.shiftKey ? -1 : 1))
            }
          },
          !0,
        )
      }
    },
    show: show,
    hide: hide,
    isVisible: () => isOpen,
  }
})()
!(function () {
  let inited = !1
  const doInit = () => {
    if (!inited)
      try {
        FindManager.init()
        inited = !0
      } catch (err) {
        console.error('[FindManager] init failed:', err)
      }
  }
  'loading' === document.readyState
    ? document.addEventListener('DOMContentLoaded', doInit, { once: !0 })
    : setTimeout(doInit, 0)
})()
