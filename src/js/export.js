window.ExportManager = (() => {
  async function resolveExportPath(ext, content) {
    const namingRule = (await window.api.storeGet('exportNamingRule')) || '{title}_{date}',
      exportDir = (await window.api.storeGet('exportDir')) || '',
      fileName = resolveNamingRule(namingRule, content) + '.' + ext,
      defaultPath = exportDir ? exportDir.replace(/\\/g, '/') + '/' + fileName : fileName,
      result = await window.api.dialogSaveFile({
        defaultPath: defaultPath,
        filters:
          {
            md: [{ name: 'Markdown', extensions: ['md'] }],
            html: [{ name: 'HTML', extensions: ['html'] }],
            pdf: [{ name: 'PDF', extensions: ['pdf'] }],
          }[ext] || [],
      })
    if (result.canceled || !result.filePath) return null
    const dir = result.filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    return (dir && (await window.api.storeSet('exportDir', dir)), result.filePath)
  }

  const toasts = []

  function showToast(msg, _type = 'default') {
    for (let i = toasts.length - 1; i >= 0; i--)
      if (toasts[i].classList.contains('toast-out')) {
        const el = toasts[i]
        toasts.splice(i, 1)
        el.remove()
      }
    const toast = document.createElement('div')
    toast.className = 'toast' + ('error' === _type ? ' toast-error' : 'success' === _type ? ' toast-success' : '')
    toast.textContent = msg
    document.body.appendChild(toast)
    toasts.push(toast)
    toast.style.bottom = 24 + 56 * (toasts.length - 1) + 'px'
    setTimeout(() => {
      toast.classList.add('toast-out')
      setTimeout(
        () =>
          (function (el) {
            const idx = toasts.indexOf(el)
            ;-1 !== idx && toasts.splice(idx, 1)
            el.remove()
            toasts.forEach((t, i) => {
              t.style.bottom = 24 + 56 * i + 'px'
            })
          })(toast),
        200,
      )
    }, 2200)
  }

  async function buildHtmlPage(mdContent) {
    const sanitized = window.DOMPurify
        ? DOMPurify.sanitize(marked.parse(mdContent), {
            ADD_TAGS: [
              'mtable', 'mtr', 'mtd', 'mrow', 'mi', 'mn', 'mo',
              'msup', 'msub', 'mfrac', 'msqrt',
            ],
            ADD_ATTR: ['target'],
            FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input'],
            FORBID_ATTR: ['style'],
            ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
          })
        : marked.parse(mdContent),
      isDark = document.body.classList.contains('theme-dark'),
      theme = isDark ? 'dark' : 'light'
    let hlCss = ''
    {
      const themeName = isDark ? 'github-dark' : 'github'
      const linkEl = document.getElementById('hljs-theme')
      if (linkEl && linkEl.sheet && linkEl.href?.includes(themeName))
        try {
          hlCss = [...linkEl.sheet.cssRules].map(r => r.cssText).join('\n')
        } catch (_err) {}
      if (!hlCss)
        try {
          hlCss = await (await fetch(`vendor/hljs/styles/${themeName}.min.css`)).text()
        } catch (_err) {}
    }
    // 收集预览容器中已渲染的 mermaid SVG，内联到导出 HTML
    const previewContainer = document.getElementById('preview-container')
    const mermaidSvgNodes = previewContainer
      ? [...previewContainer.querySelectorAll('.mermaid-block.mermaid-rendered svg')]
      : []
    let bodyContent = sanitized
    if (mermaidSvgNodes.length > 0) {
      let idx = 0
      bodyContent = sanitized.replace(/<pre><code class="language-mermaid">[\s\S]*?<\/code><\/pre>/g, (match) => {
        if (idx < mermaidSvgNodes.length) {
          return mermaidSvgNodes[idx++].outerHTML
        }
        idx++
        // 未渲染的 mermaid 代码块保留原始代码
        return match
      })
    }
    return `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Exported Markdown</title>\n<style>\n  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.75; ${'dark' === theme ? 'background:#1e1e1e;color:#e8e8e8' : 'background:#fff;color:#1a1a1a'}; }\n  h1,h2,h3,h4,h5,h6 { font-weight: 700; margin: 1.5em 0 0.6em; }\n  h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }\n  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }\n  code { font-family: monospace; font-size: 0.875em; padding: 0.2em 0.4em; border-radius: 4px; background: ${'dark' === theme ? '#333' : '#f0f0f0'}; }\n  pre { border-radius: 6px; overflow: hidden; border: 1px solid #ddd; }\n  pre code { display: block; padding: 16px; background: ${'dark' === theme ? '#2a2a2a' : '#f8f8f8'}; overflow-x: auto; }\n  blockquote { margin: 1em 0; padding: 0.5em 1.2em; border-left: 4px solid #4a6cf7; background: ${'dark' === theme ? '#2a2a2a' : '#f5f5f5'}; }\n  table { width: 100%; border-collapse: collapse; margin: 1em 0; }\n  th, td { padding: 8px 14px; border: 1px solid #ddd; }\n  th { background: ${'dark' === theme ? '#333' : '#f5f5f5'}; font-weight: 600; }\n  img { max-width: 100%; }\n  a { color: #4a6cf7; }\n  hr { border: none; border-top: 2px solid #eee; margin: 2em 0; }\n</style>\n${hlCss ? `<style>${hlCss}</style>` : ''}\n</head>\n<body>\n${bodyContent}\n</body>\n</html>`
  }

  return {
    exportMd: async function (content) {
      const filePath = await resolveExportPath('md', content)
      if (!filePath) return
      const result = await window.api.fileSave(filePath, content)
      result.success
        ? (showToast(`已导出: ${filePath.split(/[/\\]/).pop()}`), window.api.shellShowItem(filePath))
        : ExportManager.showToast('导出失败: ' + result.error, 'error')
    },
    exportHtml: async function (content) {
      const filePath = await resolveExportPath('html', content)
      if (!filePath) return
      const html = await buildHtmlPage(content),
        result = await window.api.fileSave(filePath, html)
      result.success
        ? (showToast(`已导出: ${filePath.split(/[/\\]/).pop()}`), window.api.shellShowItem(filePath))
        : ExportManager.showToast('导出失败: ' + result.error, 'error')
    },
    exportPdf: async function (content) {
      const filePath = await resolveExportPath('pdf', content)
      if (!filePath) return
      // 不触发 PreviewManager.render（会导致预览闪烁），
      // 只需等待当前预览中的 mermaid 渲染完成
      await new Promise(resolve => {
        let timedOut = false
        const timeoutTimer = setTimeout(() => {
          timedOut = true
          showToast('Mermaid 图表渲染超时，PDF 中可能缺少部分图表', 'error')
          resolve()  // 超时也继续，可能缺少 mermaid 但至少导出纯文本
        }, 15000)  // 15 秒超时
        const poll = () => {
          if (timedOut) return
          const container = document.getElementById('preview-container')
          if (!container) return setTimeout(poll, 80)
          const pending = container.querySelectorAll('.mermaid-block:not(.mermaid-rendered)')
          0 === pending.length ? (clearTimeout(timeoutTimer), resolve()) : setTimeout(poll, 80)
        }
        setTimeout(poll, 80)
      })
      const result = await window.api.exportPDF(filePath)
      result.success
        ? (showToast(`已导出 PDF: ${filePath.split(/[/\\]/).pop()}`), window.api.shellShowItem(filePath))
        : ExportManager.showToast('PDF 导出失败: ' + result.error, 'error')
    },
    importFile: async function () {
      const result = await window.api.dialogOpenFile()
      if (result.canceled || !result.filePaths.length) return null
      const filePath = result.filePaths[0],
        read = await window.api.fileRead(filePath)
      if (!read.success) return (ExportManager.showToast('读取文件失败: ' + read.error, 'error'), null)
      const name = filePath.split(/[/\\]/).pop()
      return { filePath: filePath, content: read.content, name: name }
    },
    showToast: showToast,
  }
})()
