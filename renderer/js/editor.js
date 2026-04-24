/**
 * editor.js — CodeMirror editor setup
 */

const EditorManager = (() => {
  let cm = null
  let changeCallback = null

  function init(container, options = {}) {
    cm = CodeMirror(container, {
      mode: 'markdown',
      theme: 'default',
      lineNumbers: false,
      lineWrapping: true,
      autofocus: true,
      styleActiveLine: true,
      extraKeys: {
        'Enter': 'newlineAndIndentContinueMarkdownList',
        'Ctrl-B': () => insertFormat('bold'),
        'Ctrl-I': () => insertFormat('italic'),
        'Ctrl-K': () => insertFormat('link'),
        'Ctrl-F': 'findPersistent',
        'Ctrl-H': 'replace',
        'Ctrl-G': 'jumpToLine'
      },
      placeholder: '开始写作...',
      scrollbarStyle: 'native'
    })

    cm.on('change', () => {
      if (changeCallback) changeCallback(cm.getValue())
    })

    cm.on('cursorActivity', () => {
      const cur = cm.getCursor()
      const statusCursor = document.getElementById('status-cursor')
      if (statusCursor) {
        statusCursor.textContent = `行 ${cur.line + 1}, 列 ${cur.ch + 1}`
      }
    })

    cm.on('scroll', () => {
      const info = cm.getScrollInfo()
      const ratio = info.height <= info.clientHeight ? 0 : info.top / (info.height - info.clientHeight)
      PreviewManager.syncEditorScroll(ratio)
    })

    return cm
  }

  function insertFormat(action) {
    if (!cm) return
    const sel = cm.getSelection()

    const formats = {
      bold:          { wrap: '**',  default: '粗体文字' },
      italic:        { wrap: '*',   default: '斜体文字' },
      strikethrough: { wrap: '~~',  default: '删除文字' },
      code:          { wrap: '`',   default: 'code' },
      link:          { template: `[${sel || '链接文字'}](url)` },
      image:         { template: `![${sel || '图片描述'}](url)` },
      heading: null,
      codeblock: null,
      table: null,
      quote: null,
      ul: null,
      ol: null,
      hr: null
    }

    const cursor = cm.getCursor()

    switch (action) {
      case 'bold':
      case 'italic':
      case 'strikethrough':
      case 'code': {
        const { wrap, default: def } = formats[action]
        if (sel) {
          cm.replaceSelection(`${wrap}${sel}${wrap}`)
        } else {
          const text = `${wrap}${def}${wrap}`
          cm.replaceSelection(text)
          cm.setCursor({ line: cursor.line, ch: cursor.ch + wrap.length })
          cm.setSelection(
            { line: cursor.line, ch: cursor.ch + wrap.length },
            { line: cursor.line, ch: cursor.ch + wrap.length + def.length }
          )
        }
        break
      }
      case 'link':
      case 'image': {
        const tmpl = formats[action].template
        cm.replaceSelection(tmpl)
        break
      }
      case 'heading': {
        const line = cm.getLine(cursor.line)
        if (line.startsWith('##### ')) cm.replaceRange(line.slice(6), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length })
        else if (line.startsWith('#### ')) cm.replaceRange('##### ' + line.slice(5), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length })
        else if (line.startsWith('### ')) cm.replaceRange('#### ' + line.slice(4), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length })
        else if (line.startsWith('## ')) cm.replaceRange('### ' + line.slice(3), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length })
        else if (line.startsWith('# ')) cm.replaceRange('## ' + line.slice(2), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length })
        else cm.replaceRange('# ' + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length })
        break
      }
      case 'codeblock':
        cm.replaceSelection(`\`\`\`\n${sel || '代码'}\n\`\`\``)
        break
      case 'table':
        cm.replaceSelection(`| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |`)
        break
      case 'quote': {
        const line = cm.getLine(cursor.line)
        cm.replaceRange('> ' + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length })
        break
      }
      case 'ul':
        cm.replaceSelection(`- ${sel || '列表项'}`)
        break
      case 'ol':
        cm.replaceSelection(`1. ${sel || '列表项'}`)
        break
      case 'hr':
        cm.replaceSelection('\n---\n')
        break
    }
    cm.focus()
  }

  function getValue() { return cm ? cm.getValue() : '' }
  function setValue(val) {
    if (!cm) return
    cm.setValue(val || '')
    cm.clearHistory()
  }
  // setValue without losing cursor/scroll/history — used for in-place updates (e.g. task checkbox toggle)
  function setValuePreserve(val) {
    if (!cm) return
    const cur = cm.getCursor()
    const scroll = cm.getScrollInfo().top
    cm.replaceRange(val, { line: 0, ch: 0 }, { line: cm.lineCount(), ch: 0 }, '+toggle')
    cm.setCursor(cur)
    cm.scrollTo(null, scroll)
  }
  function getCursor() { return cm ? cm.getCursor() : { line: 0, ch: 0 } }
  function setCursor(pos) { if (cm) { cm.setCursor(pos); cm.focus() } }
  function getScrollTop() { return cm ? cm.getScrollInfo().top : 0 }
  function setScrollTop(top) { if (cm) cm.scrollTo(null, top) }

  function setTheme(isDark) {
    if (!cm) return
    cm.setOption('theme', isDark ? 'dracula' : 'default')
  }

  function setFontSize(size) {
    const wrap = document.querySelector('.CodeMirror')
    if (wrap) wrap.style.fontSize = size + 'px'
  }

  function setFont(fontFamily) {
    const wrap = document.querySelector('.CodeMirror')
    if (wrap) wrap.style.fontFamily = fontFamily
  }

  function onChange(cb) { changeCallback = cb }

  function focus() {
    if (!cm) return
    cm.focus()
    // 同步再对内部隐藏 textarea 调用一次 focus，确保 OS 焦点真正落到输入框
    const ta = cm.getInputField && cm.getInputField()
    if (ta && typeof ta.focus === 'function') {
      try { ta.focus({ preventScroll: true }) } catch (_) { ta.focus() }
    }
    // Double-RAF: recover from any async blur Chromium fires after DOM changes
    requestAnimationFrame(() => {
      if (cm && !cm.state.focused) {
        cm.focus()
        const ta2 = cm.getInputField && cm.getInputField()
        if (ta2 && typeof ta2.focus === 'function') {
          try { ta2.focus({ preventScroll: true }) } catch (_) { ta2.focus() }
        }
      }
    })
  }

  function getWordCount(text) {
    if (!text) return 0
    const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const english = (text.match(/\b[a-zA-Z]+\b/g) || []).length
    return chinese + english
  }

  return {
    init, insertFormat, getValue, setValue, setValuePreserve,
    getCursor, setCursor, getScrollTop, setScrollTop,
    setTheme, setFontSize, setFont, onChange, focus, getWordCount
  }
})()
