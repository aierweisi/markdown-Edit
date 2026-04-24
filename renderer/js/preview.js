/**
 * preview.js — Markdown preview with marked + highlight.js + KaTeX + Mermaid
 */

const PreviewManager = (() => {
  let previewBody = null
  let syncScroll = true
  let renderTimer = null
  let mermaidSeq = 0
  let currentIsDark = false

  // Line anchors: array of { line, el } sorted by line, built after each render
  let lineAnchors = []
  let scrollSource = null   // 'editor' | 'preview' | null — prevents echo loops
  let scrollSourceTimer = null

  function setScrollSource(src) {
    scrollSource = src
    clearTimeout(scrollSourceTimer)
    scrollSourceTimer = setTimeout(() => { scrollSource = null }, 120)
  }

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

    // Preview → Editor scroll sync
    const pContainer = document.getElementById('preview-container')
    if (pContainer) {
      pContainer.addEventListener('scroll', () => {
        syncPreviewScroll()
      }, { passive: true })
    }

    // Click on copy button & task checkbox
    previewBody.addEventListener('mousedown', (e) => {
      const cb = e.target.closest('li > input[type="checkbox"]')
      if (cb) { e.preventDefault() }
    })
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
      const cb = e.target.closest('li > input[type="checkbox"]')
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
    const cm = EditorManager.getCM && EditorManager.getCM()
    if (!cm) return

    // Walk source line-by-line to find the Nth task checkbox
    const re = /^(\s*(?:[-*+]|\d+\.)\s+)\[( |x|X)\]/
    let count = 0
    const lineCount = cm.lineCount()
    for (let ln = 0; ln < lineCount; ln++) {
      const text = cm.getLine(ln)
      const m = text.match(re)
      if (!m) continue
      if (count === idx) {
        const startCh = m[1].length + 1  // position of space/x inside [ ]
        const checked = m[2].toLowerCase() === 'x'
        const newMark = checked ? ' ' : 'x'
        cm.replaceRange(newMark, { line: ln, ch: startCh }, { line: ln, ch: startCh + 1 }, '+toggle')
        // also flip the checkbox immediately for snappy feedback
        checkbox.checked = !checked
        return
      }
      count++
    }
  }

  function buildLineAnchors(markdown) {
    lineAnchors = []
    if (!previewBody) return
    try {
      const tokens = marked.lexer(markdown || '')
      const blockEls = Array.from(previewBody.children)
      let line = 0
      let elIdx = 0
      for (const tok of tokens) {
        if (tok.type === 'space') {
          line += (tok.raw.match(/\n/g) || []).length
          continue
        }
        const el = blockEls[elIdx++]
        if (el) lineAnchors.push({ line, el })
        line += (tok.raw ? (tok.raw.match(/\n/g) || []).length : 0)
      }
    } catch (e) {
      lineAnchors = []
    }
  }

  function findAnchorForLine(line) {
    if (!lineAnchors.length) return null
    let lo = 0, hi = lineAnchors.length - 1, ans = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lineAnchors[mid].line <= line) { ans = mid; lo = mid + 1 }
      else hi = mid - 1
    }
    const a = lineAnchors[ans]
    const b = lineAnchors[ans + 1]
    return { a, b }
  }

  function render(markdown) {
    if (!previewBody) return
    clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      try {
        // Preserve scroll position across re-render
        const container = document.getElementById('preview-container')
        const prevScrollTop = container ? container.scrollTop : 0

        // reset slug map by re-creating renderer state via marked's internal — easiest: parse fresh each call
        mermaidSeq = 0
        const stashed = stashMath(markdown || '')
        let html = marked.parse(stashed)
        html = restoreMath(html)
        // Sanitize: allow KaTeX/Mermaid SVG + math classes; forbid scripts/event handlers
        if (window.DOMPurify) {
          html = DOMPurify.sanitize(html, {
            ADD_TAGS: ['foreignObject', 'mtable', 'mtr', 'mtd', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac', 'mspace', 'mstyle', 'msqrt', 'munder', 'mover', 'munderover', 'semantics', 'annotation'],
            ADD_ATTR: ['target', 'data-mermaid-src'],
            FORBID_TAGS: ['style']
          })
        }
        previewBody.innerHTML = html

        // Restore scroll position
        if (container) container.scrollTop = prevScrollTop

        // Build line-to-element anchor map for sync scroll
        buildLineAnchors(markdown || '')

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

  function syncEditorScroll(editorScrollRatio, topLine) {
    if (!syncScroll) return
    if (scrollSource === 'preview') return
    const container = document.getElementById('preview-container')
    if (!container) return
    setScrollSource('editor')

    // Prefer line-anchor based sync if available
    if (lineAnchors.length && typeof topLine === 'number') {
      const pair = findAnchorForLine(topLine)
      if (pair && pair.a) {
        const { a, b } = pair
        const aTop = a.el.offsetTop
        let target = aTop
        if (b) {
          const frac = (topLine - a.line) / Math.max(1, b.line - a.line)
          target = aTop + (b.el.offsetTop - aTop) * Math.min(1, Math.max(0, frac))
        }
        container.scrollTop = target
        return
      }
    }
    // Fallback: ratio-based
    const maxScroll = container.scrollHeight - container.clientHeight
    container.scrollTop = maxScroll * editorScrollRatio
  }

  function syncPreviewScroll() {
    if (!syncScroll) return
    if (scrollSource === 'editor') return
    if (!window.EditorManager || !lineAnchors.length) return
    const container = document.getElementById('preview-container')
    if (!container) return
    const cm = EditorManager.getCM && EditorManager.getCM()
    if (!cm) return
    setScrollSource('preview')

    const scrollTop = container.scrollTop
    // Find which anchor pair we're between in preview
    let idx = 0
    for (let i = 0; i < lineAnchors.length; i++) {
      if (lineAnchors[i].el.offsetTop <= scrollTop) idx = i
      else break
    }
    const a = lineAnchors[idx]
    const b = lineAnchors[idx + 1]
    let targetLine
    if (b) {
      const frac = (scrollTop - a.el.offsetTop) / Math.max(1, b.el.offsetTop - a.el.offsetTop)
      targetLine = a.line + (b.line - a.line) * Math.min(1, Math.max(0, frac))
    } else {
      targetLine = a.line
    }
    // Convert line to pixel scroll in CM
    const info = cm.getScrollInfo()
    const charCoords = cm.charCoords({ line: Math.floor(targetLine), ch: 0 }, 'local')
    cm.scrollTo(null, Math.max(0, charCoords.top))
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

  return { init, render, syncEditorScroll, syncPreviewScroll, updateTheme }
})()
