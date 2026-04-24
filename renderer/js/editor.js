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
      // Selection stats
      const statusSel = document.getElementById('status-selection')
      const sepBefore = statusSel ? statusSel.previousElementSibling : null
      if (statusSel) {
        const sels = cm.listSelections()
        let chars = 0, lines = 0
        for (const s of sels) {
          const text = cm.getRange(s.anchor, s.head)
          if (text) {
            chars += text.length
            lines += text.split('\n').length
          }
        }
        if (chars > 0) {
          statusSel.textContent = `已选 ${chars} 字符 / ${lines} 行`
          if (sepBefore && sepBefore.classList.contains('statusbar-sep')) sepBefore.style.display = ''
        } else {
          statusSel.textContent = ''
          if (sepBefore && sepBefore.classList.contains('statusbar-sep')) sepBefore.style.display = 'none'
        }
      }
    })

    cm.on('scroll', () => {
      const info = cm.getScrollInfo()
      const ratio = info.height <= info.clientHeight ? 0 : info.top / (info.height - info.clientHeight)
      // Top visible line
      const topLine = cm.lineAtHeight(info.top, 'local')
      PreviewManager.syncEditorScroll(ratio, topLine)
    })

    // ── 图片粘贴 / 拖拽 ───────────────────────────────────
    const wrap = cm.getWrapperElement()

    async function handleImageFile(file) {
      if (!file || !file.type || !file.type.startsWith('image/')) return false
      const buf = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(buf)

      // 决定保存目录：当前 tab 的文件路径目录；否则落到 userData/pasted-images
      let baseDir = null
      if (window.TabManager) {
        const tab = TabManager.getActive && TabManager.getActive()
        if (tab && tab.filePath) {
          baseDir = tab.filePath.replace(/[\\/][^\\/]*$/, '')
        }
      }

      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const ts = new Date()
      const stamp = `${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}-${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}${String(ts.getSeconds()).padStart(2,'0')}`
      const fileName = `image-${stamp}.${ext}`

      const res = await window.api.imageSave({ baseDir, fileName, dataBase64: base64 })
      if (res && res.success) {
        cm.replaceSelection(`![](${res.relPath})`)
        if (!baseDir && window.ExportManager) {
          ExportManager.showToast('未保存文档，图片已存到临时目录（建议先保存 .md）')
        }
      } else {
        if (window.ExportManager) ExportManager.showToast('图片保存失败：' + (res && res.error))
      }
      return true
    }

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
      }
      return btoa(binary)
    }

    wrap.addEventListener('paste', async (e) => {
      const items = e.clipboardData && e.clipboardData.items
      if (!items) return
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          e.preventDefault()
          await handleImageFile(it.getAsFile())
          return
        }
      }
    })

    wrap.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault()
      }
    })
    wrap.addEventListener('drop', async (e) => {
      const files = e.dataTransfer && e.dataTransfer.files
      if (!files || files.length === 0) return
      let handled = false
      for (const f of files) {
        if (f.type && f.type.startsWith('image/')) {
          if (!handled) e.preventDefault()
          handled = true
          await handleImageFile(f)
        }
      }
    })

    return cm
  }

  function insertFormat(action) {
    if (!cm) return
    const sel = cm.getSelection()

    // Apply a prefix to every line in current selection (or current line if no selection)
    function applyLinePrefix(prefix, fallback) {
      const from = cm.getCursor('from')
      const to = cm.getCursor('to')
      const startLine = from.line
      const endLine = to.line === from.line || to.ch > 0 ? to.line : to.line - 1
      const lines = []
      for (let i = startLine; i <= endLine; i++) lines.push(cm.getLine(i))
      const allHave = lines.every(l => l.startsWith(prefix))
      const newLines = lines.map(l => {
        if (allHave) return l.slice(prefix.length)
        if (l.length === 0 && fallback) return prefix + fallback
        return prefix + l
      })
      cm.replaceRange(
        newLines.join('\n'),
        { line: startLine, ch: 0 },
        { line: endLine, ch: cm.getLine(endLine).length }
      )
    }

    function applyLinePrefixOrdered(fallback) {
      const from = cm.getCursor('from')
      const to = cm.getCursor('to')
      const startLine = from.line
      const endLine = to.line === from.line || to.ch > 0 ? to.line : to.line - 1
      const lines = []
      for (let i = startLine; i <= endLine; i++) lines.push(cm.getLine(i))
      const allHave = lines.every(l => /^\d+\.\s/.test(l))
      const newLines = lines.map((l, i) => {
        if (allHave) return l.replace(/^\d+\.\s/, '')
        const body = l.length === 0 && fallback ? fallback : l
        return `${i + 1}. ${body}`
      })
      cm.replaceRange(
        newLines.join('\n'),
        { line: startLine, ch: 0 },
        { line: endLine, ch: cm.getLine(endLine).length }
      )
    }

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
        // H1→H2→H3→H4→H5→H6→plain→H1
        const m = line.match(/^(#{1,6})\s(.*)$/)
        let next
        if (!m) next = '# ' + line
        else if (m[1].length < 6) next = '#'.repeat(m[1].length + 1) + ' ' + m[2]
        else next = m[2]
        cm.replaceRange(next, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length })
        break
      }
      case 'codeblock':
        cm.replaceSelection(`\`\`\`\n${sel || '代码'}\n\`\`\``)
        break
      case 'table':
        cm.replaceSelection(`| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |`)
        break
      case 'quote': {
        applyLinePrefix('> ')
        break
      }
      case 'ul':
        applyLinePrefix('- ', '列表项')
        break
      case 'ol':
        applyLinePrefixOrdered('列表项')
        break
      case 'hr':
        cm.replaceSelection('\n---\n')
        break
    }
    cm.focus()
  }

  function getValue() { return cm ? cm.getValue() : '' }
  function getCM() { return cm }
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
    const lastLine = cm.lastLine()
    const endCh = cm.getLine(lastLine).length
    cm.replaceRange(val, { line: 0, ch: 0 }, { line: lastLine, ch: endCh }, '+toggle')
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
    init, insertFormat, getValue, getCM, setValue, setValuePreserve,
    getCursor, setCursor, getScrollTop, setScrollTop,
    setTheme, setFontSize, setFont, onChange, focus, getWordCount
  }
})()
