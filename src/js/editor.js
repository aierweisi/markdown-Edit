window.EditorManager = (() => {
  // ── 常量定义 ──
  const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  // 粘贴图片大小限制（5MB）
  const FIND_SEL_MAX_LENGTH = 200               // 查找时自动填入的选中文本最大长度
  let cm = null,
    onChangeCallback = null

  function insertFormat(formatType) {
    if (!cm) return
    const sel = cm.getSelection()

    function toggleLinePrefix(prefix, fallback) {
      const from = cm.getCursor('from'),
        to = cm.getCursor('to'),
        startLine = from.line,
        endLine = to.line === from.line || to.ch > 0 ? to.line : to.line - 1,
        lines = []
      for (let i = startLine; i <= endLine; i++) lines.push(cm.getLine(i))
      const allHavePrefix = lines.every(line => line.startsWith(prefix)),
        newLines = lines.map(line =>
          allHavePrefix
            ? line.slice(prefix.length)
            : 0 === line.length && fallback
              ? prefix + fallback
              : prefix + line,
        )
      cm.replaceRange(newLines.join('\n'), { line: startLine, ch: 0 }, { line: endLine, ch: cm.getLine(endLine).length })
    }

    const actions = {
        bold: { wrap: '**', default: '粗体文字' },
        italic: { wrap: '*', default: '斜体文字' },
        strikethrough: { wrap: '~~', default: '删除文字' },
        code: { wrap: '`', default: 'code' },
        link: { template: `[${sel || '链接文字'}](url)` },
        image: { template: `![${sel || '图片描述'}](url)` },
        heading: null,
        codeblock: null,
        table: null,
        quote: null,
        ul: null,
        ol: null,
        hr: null,
      },
      cursor = cm.getCursor()

    switch (formatType) {
      case 'bold':
      case 'italic':
      case 'strikethrough':
      case 'code': {
        const { wrap, default: defaultText } = actions[formatType]
        if (sel) cm.replaceSelection(`${wrap}${sel}${wrap}`)
        else {
          const wrapped = `${wrap}${defaultText}${wrap}`
          cm.replaceSelection(wrapped)
          cm.setCursor({ line: cursor.line, ch: cursor.ch + wrap.length })
          cm.setSelection(
            { line: cursor.line, ch: cursor.ch + wrap.length },
            { line: cursor.line, ch: cursor.ch + wrap.length + defaultText.length },
          )
        }
        break
      }
      case 'link':
      case 'image': {
        const tmpl = actions[formatType].template
        cm.replaceSelection(tmpl)
        break
      }
      case 'heading': {
        const lineText = cm.getLine(cursor.line) || ''
        if (!lineText.trim()) {
          cm.replaceRange('# ', { line: cursor.line, ch: 0 }, { line: cursor.line, ch: 0 })
        } else {
          const match = lineText.match(/^(#{1,6})\s(.*)$/)
          const replacement = match
            ? match[1].length < 6
              ? '#'.repeat(match[1].length + 1) + ' ' + match[2]
              : match[2]
            : '# ' + lineText
          cm.replaceRange(replacement, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineText.length })
        }
        break
      }
      case 'codeblock':
        cm.replaceSelection(`\`\`\`\n${sel || '代码'}\n\`\`\``)
        break
      case 'table':
        cm.replaceSelection('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |')
        break
      case 'quote':
        toggleLinePrefix('> ')
        break
      case 'ul':
        toggleLinePrefix('- ', '列表项')
        break
      case 'ol':
        (function () {
          const from = cm.getCursor('from'),
            to = cm.getCursor('to'),
            startLine = from.line,
            endLine = to.line === from.line || to.ch > 0 ? to.line : to.line - 1,
            lines = []
          for (let i = startLine; i <= endLine; i++) lines.push(cm.getLine(i))
          const allNumbered = lines.every(l => /^\d+\.\s/.test(l)),
            newLines = lines.map((l, idx) =>
              allNumbered
                ? l.replace(/^\d+\.\s/, '')
                : `${idx + 1}. ${0 === l.length ? '列表项' : l}`,
            )
          cm.replaceRange(newLines.join('\n'), { line: startLine, ch: 0 }, { line: endLine, ch: cm.getLine(endLine).length })
        })()
        break
      case 'hr':
        cm.replaceSelection('\n---\n')
    }
    cm.focus()
  }

  return {
    init: function (containerEl, opts = {}) {
      cm = CodeMirror(containerEl, {
        mode: 'markdown',
        theme: 'default',
        lineNumbers: !1,
        lineWrapping: !0,
        autofocus: !0,
        styleActiveLine: !0,
        extraKeys: {
          Enter: 'newlineAndIndentContinueMarkdownList',
          'Ctrl-B': () => insertFormat('bold'),
          'Ctrl-I': () => insertFormat('italic'),
          'Ctrl-K': () => insertFormat('link'),
          'Ctrl-G': 'jumpToLine',
        },
        placeholder: '开始写作...',
        scrollbarStyle: 'native',
      })

      cm.on('change', () => {
        onChangeCallback && onChangeCallback(cm.getValue())
      })

      cm.on('cursorActivity', () => {
        const pos = cm.getCursor(),
          cursorEl = document.getElementById('status-cursor')
        cursorEl && (cursorEl.textContent = `行 ${pos.line + 1}, 列 ${pos.ch + 1}`)
        const selEl = document.getElementById('status-selection'),
          prevSep = selEl ? selEl.previousElementSibling : null
        if (selEl) {
          const selections = cm.listSelections()
          let totalChars = 0,
            totalLines = 0
          for (const sel of selections) {
            const range = cm.getRange(sel.anchor, sel.head)
            range && ((totalChars += range.length), (totalLines += range.split('\n').length))
          }
          totalChars > 0
            ? ((selEl.textContent = `已选 ${totalChars} 字符 / ${totalLines} 行`),
              prevSep && prevSep.classList.contains('statusbar-sep') && (prevSep.style.display = ''))
            : ((selEl.textContent = ''),
              prevSep && prevSep.classList.contains('statusbar-sep') && (prevSep.style.display = 'none'))
        }
      })

      cm.on('scroll', () => {
        const info = cm.getScrollInfo(),
          ratio = info.height <= info.clientHeight ? 0 : info.top / (info.height - info.clientHeight),
          topLine = cm.lineAtHeight(info.top, 'local')
        PreviewManager.syncEditorScroll(ratio, topLine)
      })

      const wrapper = cm.getWrapperElement()

      async function getImageSaveDir() {
        try {
          const dir = await window.api.storeGet('imageSaveDir')
          return (dir && String(dir).trim()) || 'assets'
        } catch {
          return 'assets'
        }
      }

      function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer)
        let binary = ''
        const chunkSize = 8192
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
        }
        return btoa(binary)
      }

      async function handleImageFile(file) {
        if (!file || !file.type || !file.type.startsWith('image/')) return !1
        // 对大图片（>5MB）弹出确认，防止意外粘贴导致内存溢出
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          const ok = await window.showConfirm(
            `图片大小 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 5MB 限制。是否继续插入？`,
            { title: '图片过大', okText: '继续插入', cancelText: '取消' },
          )
          if (!ok) return !1
        }
        let base64Data = ''
        try {
          const buffer = await file.arrayBuffer()
          base64Data = arrayBufferToBase64(buffer)
        } catch (err) {
          console.error('[Image] 文件读取失败:', err)
          return !1
        }
        let baseDir = null
        if (window.TabManager) {
          const active = TabManager.getActive && TabManager.getActive()
          active && active.filePath && (baseDir = active.filePath.replace(/[\\/][^\\/]*$/, ''))
        }
        const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg'),
          now = new Date(),
          ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`,
          fileName = `image-${ts}.${ext}`
        try {
          const result = await window.api.imageSave({
            baseDir: baseDir,
            fileName: fileName,
            dataBase64: base64Data,
            imageDir: await getImageSaveDir(),
          })
          result && result.success
            ? cm.replaceSelection(`![](${result.relPath})`)
            : console.error('[Image] 图片保存失败:', result && result.error)
        } catch (err) {
          console.error('[Image] 图片保存失败:', err)
          return !1
        }
        return !0
      }

      wrapper.addEventListener('paste', async evt => {
        const items = evt.clipboardData && evt.clipboardData.items
        if (items)
          for (const item of items)
            if ('file' === item.kind && item.type.startsWith('image/'))
              return (evt.preventDefault(), void (await handleImageFile(item.getAsFile())))
      })

      wrapper.addEventListener('dragenter', evt => {
        if (evt.dataTransfer && Array.from(evt.dataTransfer.types).includes('Files')) {
          evt.preventDefault()
          wrapper.classList.add('drag-over')
        }
      })

      wrapper.addEventListener('dragover', evt => {
        if (evt.dataTransfer && Array.from(evt.dataTransfer.types).includes('Files')) {
          evt.preventDefault()
          wrapper.classList.add('drag-over')
        }
      })

      wrapper.addEventListener('dragleave', evt => {
        // 只在离开 wrapper 本身时移除高亮（避免子元素冒泡误触）
        if (!wrapper.contains(evt.relatedTarget)) {
          wrapper.classList.remove('drag-over')
        }
      })

      wrapper.addEventListener('drop', async evt => {
        wrapper.classList.remove('drag-over')
        const files = evt.dataTransfer && evt.dataTransfer.files
        if (!files || 0 === files.length) return
        let handled = !1
        for (const f of files) {
          if (f.type && f.type.startsWith('image/')) {
            handled || evt.preventDefault()
            handled = !0
            await handleImageFile(f)
          } else {
            const filePath = await window.api.getFilePath(f)
            if (filePath) {
              const ext = f.name.split('.').pop().toLowerCase()
              if (['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'txt'].includes(ext)) {
                handled || evt.preventDefault()
                handled = !0
                window.dispatchEvent(new CustomEvent('app:open-file', { detail: { filePath } }))
              }
            }
          }
        }
      })

      return cm
    },
    insertFormat: insertFormat,
    getValue: function () {
      return cm ? cm.getValue() : ''
    },
    getCM: function () {
      return cm
    },
    setValue: function (val) {
      cm && cm.setValue(val || '')
    },
    setValuePreserve: function (val) {
      if (!cm) return
      const cursor = cm.getCursor(),
        scrollTop = cm.getScrollInfo().top,
        lastLine = cm.lastLine(),
        lastLineLen = cm.getLine(lastLine).length
      cm.replaceRange(val, { line: 0, ch: 0 }, { line: lastLine, ch: lastLineLen }, '+toggle')
      cm.setCursor(cursor)
      cm.scrollTo(null, scrollTop)
    },
    createDoc: function (content) {
      return window.CodeMirror ? window.CodeMirror.Doc(content || '', 'markdown') : null
    },
    swapDoc: function (doc) {
      cm && doc && cm.swapDoc(doc)
    },
    getCursor: function () {
      return cm ? cm.getCursor() : { line: 0, ch: 0 }
    },
    setCursor: function (pos) {
      cm && (cm.setCursor(pos), cm.focus())
    },
    getScrollTop: function () {
      return cm ? cm.getScrollInfo().top : 0
    },
    setScrollTop: function (top) {
      cm && cm.scrollTo(null, top)
    },
    setTheme: function () {
      cm && cm.setOption('theme', 'default')
    },
    setFontSize: function (size) {
      const el = document.querySelector('.CodeMirror')
      el && (el.style.fontSize = size + 'px')
    },
    setFont: function (font) {
      const el = document.querySelector('.CodeMirror')
      el && (el.style.fontFamily = font)
    },
    onChange: function (cb) {
      onChangeCallback = cb
    },
    focus: function () {
      if (!cm) return
      cm.focus()
      const inputEl = cm.getInputField && cm.getInputField()
      if (inputEl && 'function' == typeof inputEl.focus)
        try {
          inputEl.focus({ preventScroll: !0 })
        } catch (_err) {
          inputEl.focus()
        }
      requestAnimationFrame(() => {
        if (cm && !cm.state.focused) {
          cm.focus()
          const inputEl2 = cm.getInputField && cm.getInputField()
          if (inputEl2 && 'function' == typeof inputEl2.focus)
            try {
              inputEl2.focus({ preventScroll: !0 })
            } catch (_err) {
              inputEl2.focus()
            }
        }
      })
    },
    getWordCount: function (text) {
      return text
        ? (text.match(/[\u4e00-\u9fa5]/g) || []).length + (text.match(/\b[a-zA-Z]+\b/g) || []).length
        : 0
    },
  }
})()
