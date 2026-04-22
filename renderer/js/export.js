/**
 * export.js — File import/export logic
 */

const ExportManager = (() => {
  function resolveNamingRule(rule, content) {
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '')
    const datetime = `${date}_${time}`

    // Extract title from first H1
    const titleMatch = content.match(/^#\s+(.+)/m)
    const title = titleMatch
      ? titleMatch[1].replace(/[/\\:*?"<>|]/g, '_').trim()
      : '未命名'

    return rule
      .replace(/{title}/g, title)
      .replace(/{date}/g, date)
      .replace(/{time}/g, time)
      .replace(/{datetime}/g, datetime)
  }

  async function getExportPath(ext, content) {
    const rule = (await window.api.storeGet('exportNamingRule')) || '{title}_{date}'
    const exportDir = (await window.api.storeGet('exportDir')) || ''
    const filename = resolveNamingRule(rule, content) + '.' + ext

    const defaultPath = exportDir
      ? exportDir.replace(/\\/g, '/') + '/' + filename
      : filename

    const filters = {
      md:   [{ name: 'Markdown', extensions: ['md'] }],
      html: [{ name: 'HTML', extensions: ['html'] }],
      pdf:  [{ name: 'PDF', extensions: ['pdf'] }]
    }

    const result = await window.api.dialogSaveFile({
      defaultPath,
      filters: filters[ext] || []
    })

    if (result.canceled || !result.filePath) return null

    // Remember export directory
    const dir = result.filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    if (dir) await window.api.storeSet('exportDir', dir)

    return result.filePath
  }

  async function exportMd(content) {
    const filePath = await getExportPath('md', content)
    if (!filePath) return
    const res = await window.api.fileSave(filePath, content)
    if (res.success) {
      showToast(`已导出: ${filePath.split(/[/\\]/).pop()}`)
      window.api.shellShowItem(filePath)
    } else {
      alert('导出失败: ' + res.error)
    }
  }

  async function exportHtml(content) {
    const filePath = await getExportPath('html', content)
    if (!filePath) return

    const html = buildHtmlDocument(content)
    const res = await window.api.fileSave(filePath, html)
    if (res.success) {
      showToast(`已导出: ${filePath.split(/[/\\]/).pop()}`)
      window.api.shellShowItem(filePath)
    } else {
      alert('导出失败: ' + res.error)
    }
  }

  function buildHtmlDocument(markdown) {
    const body = marked.parse(markdown)
    const theme = document.body.classList.contains('theme-dark') ? 'dark' : 'light'
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Exported Markdown</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; line-height: 1.75; ${theme === 'dark' ? 'background:#1e1e1e;color:#e8e8e8' : 'background:#fff;color:#1a1a1a'}; }
  h1,h2,h3,h4,h5,h6 { font-weight: 700; margin: 1.5em 0 0.6em; }
  h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
  code { font-family: monospace; font-size: 0.875em; padding: 0.2em 0.4em; border-radius: 4px; background: ${theme === 'dark' ? '#333' : '#f0f0f0'}; }
  pre { border-radius: 6px; overflow: hidden; border: 1px solid #ddd; }
  pre code { display: block; padding: 16px; background: ${theme === 'dark' ? '#2a2a2a' : '#f8f8f8'}; overflow-x: auto; }
  blockquote { margin: 1em 0; padding: 0.5em 1.2em; border-left: 4px solid #4a6cf7; background: ${theme === 'dark' ? '#2a2a2a' : '#f5f5f5'}; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; }
  th, td { padding: 8px 14px; border: 1px solid #ddd; }
  th { background: ${theme === 'dark' ? '#333' : '#f5f5f5'}; font-weight: 600; }
  img { max-width: 100%; }
  a { color: #4a6cf7; }
  hr { border: none; border-top: 2px solid #eee; margin: 2em 0; }
</style>
</head>
<body>
${body}
</body>
</html>`
  }

  async function exportPdf(content) {
    const filePath = await getExportPath('pdf', content)
    if (!filePath) return

    // Render to preview first, then print
    PreviewManager.render(content)
    // Small delay to let preview render
    await new Promise(r => setTimeout(r, 300))

    const res = await window.api.exportPDF(filePath)
    if (res.success) {
      showToast(`已导出 PDF: ${filePath.split(/[/\\]/).pop()}`)
      window.api.shellShowItem(filePath)
    } else {
      alert('PDF 导出失败: ' + res.error)
    }
  }

  async function importFile() {
    const result = await window.api.dialogOpenFile()
    if (result.canceled || !result.filePaths.length) return null

    const filePath = result.filePaths[0]
    const res = await window.api.fileRead(filePath)
    if (!res.success) { alert('读取文件失败: ' + res.error); return null }

    const name = filePath.split(/[/\\]/).pop()
    return { filePath, content: res.content, name }
  }

  function showToast(msg, type = 'default') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove())
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.textContent = msg
    document.body.appendChild(toast)
    setTimeout(() => {
      toast.classList.add('toast-out')
      setTimeout(() => toast.remove(), 200)
    }, 2200)
  }

  return { exportMd, exportHtml, exportPdf, importFile, showToast }
})()
