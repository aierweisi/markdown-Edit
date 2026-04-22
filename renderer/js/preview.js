/**
 * preview.js — Markdown preview with marked + highlight.js
 */

const PreviewManager = (() => {
  let previewBody = null
  let syncScroll = true
  let renderTimer = null

  function init() {
    previewBody = document.getElementById('preview-body')

    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try { return hljs.highlight(code, { language: lang }).value } catch {}
        }
        try { return hljs.highlightAuto(code).value } catch {}
        return code
      }
    })

    // Sync scroll
    const syncToggle = document.getElementById('sync-scroll')
    syncToggle.addEventListener('change', () => { syncScroll = syncToggle.checked })

    // Preview scroll sync to editor
    const previewContainer = document.getElementById('preview-container')
    previewContainer.addEventListener('scroll', () => {
      if (!syncScroll) return
      // reverse sync not implemented to avoid loop
    })
  }

  function render(markdown) {
    if (!previewBody) return
    clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      const html = marked.parse(markdown || '')
      previewBody.innerHTML = html
      // Re-highlight code blocks
      previewBody.querySelectorAll('pre code').forEach(el => {
        if (!el.classList.contains('hljs')) {
          hljs.highlightElement(el)
        }
      })
    }, 100)
  }

  function syncEditorScroll(editorScrollRatio) {
    if (!syncScroll) return
    const container = document.getElementById('preview-container')
    if (!container) return
    const maxScroll = container.scrollHeight - container.clientHeight
    container.scrollTop = maxScroll * editorScrollRatio
  }

  function updateTheme(isDark) {
    const light = document.getElementById('hljs-light')
    const dark = document.getElementById('hljs-dark')
    if (light && dark) {
      light.disabled = isDark
      dark.disabled = !isDark
    }
  }

  return { init, render, syncEditorScroll, updateTheme }
})()
