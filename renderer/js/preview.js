/**
 * preview.js — Markdown preview with marked + highlight.js + KaTeX + Mermaid
 */

const PreviewManager = (() => {
  let previewBody = null
  let syncScroll = true
  let renderTimer = null
  let mermaidSeq = 0
  let currentIsDark = false

  // ---- math placeholders (protect math from marked) ----
  const mathStore = []
  function stashMath(src) {
    mathStore.length = 0
    // Block math: $$...$$
    src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
      const i = mathStore.push({ display: true, expr }) - 1
      return `\n\n@@MATHBLOCK${i}@@\n\n`
    })
    // Inline math: $...$  (avoid escaped \$ and avoid $...$ that spans newlines)
    src = src.replace(/(^|[^\\$])\$([^\$\n]+?)\$(?!\d)/g, (m, pre, expr) => {
      const i = mathStore.push({ display: false, expr }) - 1
      return `${pre}@@MATHINLINE${i}@@`
    })
    return src
  }
  function restoreMath(html) {
    return html
      .replace(/@@MATHBLOCK(\d+)@@/g, (_, i) => {
        const item = mathStore[+i]; if (!item) return ''
        try {
          return `<div class="math-block">${katex.renderToString(item.expr, { displayMode: true, throwOnError: false })}</div>`
        } catch (e) { return `<pre class="math-error">${escapeHtml(item.expr)}</pre>` }
      })
      .replace(/@@MATHINLINE(\d+)@@/g, (_, i) => {
        const item = mathStore[+i]; if (!item) return ''
        try {
          return katex.renderToString(item.expr, { displayMode: false, throwOnError: false })
        } catch (e) { return `<code class="math-error">${escapeHtml(item.expr)}</code>` }
      })
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
  }

  function slugify(text) {
    return String(text).toLowerCase().trim()
      .replace(/[\s\u3000]+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5\-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'h'
  }

  function init() {
    previewBody = document.getElementById('preview-body')

    // Mermaid init
    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })
    }

    // Configure marked
    const renderer = new marked.Renderer()
    const usedSlugs = new Map()

    renderer.code = (code, lang) => {
      const text = (typeof code === 'object' && code !== null) ? code.text : code
      const language = (typeof code === 'object' && code !== null) ? (code.lang || lang || '') : (lang || '')

      // Mermaid block
      if (language === 'mermaid') {
        const id = `mermaid-${++mermaidSeq}`
        return `<div class="mermaid-block" data-mermaid-src="${escapeHtml(text)}" id="${id}">${escapeHtml(text)}</div>`
      }

      let highlighted = escapeHtml(text)
      if (language && hljs.getLanguage(language)) {
        try { highlighted = hljs.highlight(text, { language }).value } catch {}
      } else {
        try { highlighted = hljs.highlightAuto(text).value } catch {}
      }
      return `<pre class="code-pre"><button class="code-copy-btn" type="button" title="复制">复制</button><code class="hljs language-${language}">${highlighted}</code></pre>`
    }

    // Heading anchors
    renderer.heading = (text, level, raw) => {
      const t = (typeof text === 'object' && text !== null) ? (text.text || '') : text
      const lvl = (typeof text === 'object' && text !== null) ? text.depth : level
      const rawText = (typeof text === 'object' && text !== null) ? (text.raw || t) : (raw || t)
      const base = slugify(String(rawText).replace(/<[^>]+>/g, ''))
      const n = (usedSlugs.get(base) || 0) + 1
      usedSlugs.set(base, n)
      const id = n === 1 ? base : `${base}-${n}`
      // marked v9 may pass tokens; rely on text being string for inline content
      const inner = (typeof text === 'object' && text !== null && text.tokens)
        ? marked.parser(text.tokens).replace(/^<p>|<\/p>\s*$/g, '')
        : String(t)
      return `<h${lvl} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${inner}</h${lvl}>`
    }

    // Task list checkbox: marked already emits <input disabled type="checkbox"> for GFM
    // We rewrite it later in DOM to enable click-to-toggle.

    marked.setOptions({ breaks: true, gfm: true, renderer })

    // Sync scroll toggle
    const syncToggle = document.getElementById('sync-scroll')
    syncToggle.addEventListener('change', () => { syncScroll = syncToggle.checked })

    // Click on copy button
    previewBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.code-copy-btn')
      if (btn) {
        const code = btn.parentElement.querySelector('code')
        if (code) {
          navigator.clipboard.writeText(code.innerText).then(() => {
            const old = btn.textContent
            btn.textContent = '已复制'
            btn.classList.add('copied')
            setTimeout(() => { btn.textContent = old; btn.classList.remove('copied') }, 1200)
          })
        }
        return
      }
      // Task list toggle
      const cb = e.target.closest('input[type="checkbox"].task-list-checkbox, li > input[type="checkbox"]')
      if (cb) {
        e.preventDefault()
        toggleTaskInSource(cb)
      }
    })
  }

  function toggleTaskInSource(checkbox) {
    if (!window.EditorManager) return
    const all = previewBody.querySelectorAll('li > input[type="checkbox"]')
    const idx = Array.prototype.indexOf.call(all, checkbox)
    if (idx < 0) return
    const src = EditorManager.getValue()
    const re = /^(\s*[-*+]\s+)\[( |x|X)\]/gm
    let m, count = 0, target = null
    while ((m = re.exec(src)) !== null) {
      if (count === idx) { target = m; break }
      count++
    }
    if (!target) return
    const checked = target[2].toLowerCase() === 'x'
    const newMark = checked ? ' ' : 'x'
    const start = target.index + target[1].length
    const newSrc = src.slice(0, start) + `[${newMark}]` + src.slice(start + 3)
    EditorManager.setValuePreserve(newSrc)
  }

  function render(markdown) {
    if (!previewBody) return
    clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      try {
        // reset slug map by re-creating renderer state via marked's internal — easiest: parse fresh each call
        mermaidSeq = 0
        const stashed = stashMath(markdown || '')
        let html = marked.parse(stashed)
        html = restoreMath(html)
        previewBody.innerHTML = html

        // Add task-list class to checkboxes/li
        previewBody.querySelectorAll('li > input[type="checkbox"]').forEach(cb => {
          cb.removeAttribute('disabled')
          cb.classList.add('task-list-checkbox')
          cb.parentElement.classList.add('task-list-item')
        })

        // Render mermaid blocks
        const mermaids = previewBody.querySelectorAll('.mermaid-block')
        if (mermaids.length && window.mermaid) {
          mermaids.forEach(async (el) => {
            const src = el.getAttribute('data-mermaid-src') || el.textContent
            try {
              const { svg } = await mermaid.render(`m-${el.id}-svg`, src)
              el.innerHTML = svg
              el.classList.add('mermaid-rendered')
            } catch (err) {
              el.innerHTML = `<pre class="mermaid-error">Mermaid 渲染错误：${escapeHtml(err.message || String(err))}</pre>`
            }
          })
        }
      } catch (e) {
        previewBody.innerHTML = `<pre class="render-error">${escapeHtml(e.message || String(e))}</pre>`
      }
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
    currentIsDark = isDark
    const light = document.getElementById('hljs-light')
    const dark = document.getElementById('hljs-dark')
    if (light && dark) {
      light.disabled = isDark
      dark.disabled = !isDark
    }
    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default', securityLevel: 'loose' })
      // re-render existing
      if (window.EditorManager) render(EditorManager.getValue())
    }
  }

  return { init, render, syncEditorScroll, updateTheme }
})()
