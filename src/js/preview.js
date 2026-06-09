window.PreviewManager = (() => {
  let previewBody = null,
    syncScrollEnabled = !0,
    mermaidIdCounter = 0,
    headingAnchors = [],
    scrollSource = null,
    debounceTimer = null,
    headingAnchorDebounceTimer = null
  const mermaidCache = new Map()
  const MAX_MERMAID_CACHE = 50
  let mermaidObserver = null
  let markdownWorker = null
  let renderSeq = 0  // 递增序列号，用于丢弃过期 worker 响应

  async function renderMermaidBlock(block) {
    const src = block.getAttribute('data-mermaid-src') || block.textContent
    try {
      const { svg } = await mermaid.render(`m-${block.id}-svg`, src)
      cacheMermaid(src, svg)
      block.innerHTML = svg
      block.classList.add('mermaid-rendered')
    } catch (err) {
      block.innerHTML = `<pre class="mermaid-error">Mermaid 渲染错误：${escapeHtml(err.message || String(err))}</pre>`
    }
  }

  function cacheMermaid(key, svg) {
    if (mermaidCache.size >= MAX_MERMAID_CACHE) {
      const firstKey = mermaidCache.keys().next().value
      if (firstKey !== void 0) mermaidCache.delete(firstKey)
    }
    mermaidCache.set(key, svg)
  }

  function setScrollSource(source) {
    scrollSource = source
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      scrollSource = null
    }, 120)
  }

  function buildHeadingAnchors(text) {
    headingAnchors = []
    if (!previewBody) return
    try {
      const tokens = marked.lexer(text || ''),
        children = Array.from(previewBody.children)
      let lineNum = 0,
        childIdx = 0
      for (const token of tokens) {
        if ('space' === token.type) {
          lineNum += (token.raw.match(/\n/g) || []).length
          continue
        }
        const el = children[childIdx++]
        el && headingAnchors.push({ line: lineNum, el: el })
        lineNum += token.raw ? (token.raw.match(/\n/g) || []).length : 0
      }
    } catch (_err) {
      headingAnchors = []
    }
  }

  function escapeHtml(text) {
    return String(text).replace(
      /[&<>"']/g,
      ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
    )
  }

  let lightboxEl = null,
    imageState = null

  function closeLightbox() {
    if (!lightboxEl) return
    lightboxEl._cleanup && lightboxEl._cleanup()
    document.body.style.overflow = ''
    lightboxEl.classList.add('image-lightbox-closing')
    const onTransitionEnd = () => {
      lightboxEl && (lightboxEl.remove(),
        (lightboxEl = null),
        (imageState = null))
    }
    lightboxEl.addEventListener('transitionend', onTransitionEnd, { once: !0 })
    // 如果过渡动画意外未触发，300ms 后强制清理
    setTimeout(() => {
      if (lightboxEl && lightboxEl.classList.contains('image-lightbox-closing')) {
        lightboxEl.removeEventListener('transitionend', onTransitionEnd)
        onTransitionEnd()
      }
    }, 300)
  }

  // 同步渲染管线（无 worker 时的兜底路径 / 内联测试用）
  function renderSync(mdContent) {
    const text = mdContent || ''
    const mathExprs = []
    const mathProcessed = text
      .replace(/\$\$([\s\S]+?)\$\$/g, (m, expr) => `\n\n@@MATHBLOCK${mathExprs.push({ display: !0, expr }) - 1}@@\n\n`)
      .replace(/(^|[^\\$])$([^$\n]+?)$(?!\d)/g, (m, before, expr) => `${before}@@MATHINLINE${mathExprs.push({ display: !1, expr }) - 1}@@`)
    let html = marked.parse(mathProcessed)
    html = html
      .replace(/@@MATHBLOCK(\d+)@@/g, (m, idx) => {
        const e = mathExprs[+idx]
        return e ? (() => { try { return `<div class="math-block">${katex.renderToString(e.expr, { displayMode: !0, throwOnError: !1 })}</div>` } catch (err) { return `<pre class="math-error">${escapeHtml(e.expr)}</pre>` } })() : ''
      })
      .replace(/@@MATHINLINE(\d+)@@/g, (m, idx) => {
        const e = mathExprs[+idx]
        return e ? (() => { try { return katex.renderToString(e.expr, { displayMode: !1, throwOnError: !1 }) } catch (err) { return `<code class="math-error">${escapeHtml(e.expr)}</code>` } })() : ''
      })
    return html
  }

  // 通过 Web Worker 异步渲染（不阻塞主线程）
  function renderViaWorker(mdContent) {
    return new Promise((resolve, reject) => {
      const seq = ++renderSeq
      const timeout = setTimeout(() => {
        markdownWorker.removeEventListener('message', onMsg)
        reject(new Error('Worker timeout'))
      }, 15000)
      function onMsg(e) {
        markdownWorker.removeEventListener('message', onMsg)
        clearTimeout(timeout)
        if (seq !== renderSeq) return  // 过期响应，丢弃
        if (e.data && e.data.html !== undefined) resolve(e.data.html)
        else reject(new Error(e.data && e.data.error || 'Worker error'))
      }
      markdownWorker.addEventListener('message', onMsg)
      markdownWorker.postMessage({ text: mdContent || '' })
    })
  }

  // 公共后处理：DOMPurify + DOM 更新 + 图片路径 + Mermaid + heading anchors
  function applyHtml(html, mdContent) {
    // Sanitize
    if (window.DOMPurify) {
      html = DOMPurify.sanitize(html, {
        ADD_TAGS: ['mtable','mtr','mtd','mrow','mi','mn','mo','msup','msub','mfrac','mspace','mstyle','msqrt','munder','mover','munderover','semantics','annotation'],
        ADD_ATTR: ['target', 'data-mermaid-src'],
        FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input'],
        FORBID_ATTR: ['style'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|mailto|data|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      })
    }

    const container = document.getElementById('preview-container')
    const savedScrollTop = container ? container.scrollTop : 0

    requestAnimationFrame(() => {
      // 增量 DOM 更新
      if (window.morphdom) {
        morphdom(previewBody, `<article class="markdown-body">${html}</article>`, {
          childrenOnly: true,
          onBeforeElUpdated: (fromEl, toEl) => {
            if (fromEl.classList.contains('mermaid-rendered') && !toEl.classList.contains('mermaid-rendered')) return false
            return true
          },
        })
      } else {
        previewBody.innerHTML = html
      }
    })

    // Resolve relative image paths
    ;(function () {
      if (!previewBody || !window.TabManager) return
      const active = TabManager.getActive && TabManager.getActive()
      if (!active || !active.filePath) return
      const lastSlash = Math.max(active.filePath.lastIndexOf('\\'), active.filePath.lastIndexOf('/'))
      if (lastSlash < 0) return
      const baseUrl = 'file:///' + active.filePath.slice(0, lastSlash).replace(/\\/g, '/').replace(/^\/+/, '') + '/',
        hasProtocol = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|blob:)/i
      previewBody.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src')
        if (src && !hasProtocol.test(src))
          try { img.src = new URL(src, baseUrl).href } catch (_err) {}
      })
    })()

    container && (container.scrollTop = savedScrollTop)

    // Build heading anchor index
    if (mdContent && mdContent.length > 50000) {
      clearTimeout(headingAnchorDebounceTimer)
      headingAnchorDebounceTimer = setTimeout(() => { buildHeadingAnchors(mdContent); headingAnchorDebounceTimer = null }, 500)
    } else {
      buildHeadingAnchors(mdContent || '')
    }

    // Task list checkboxes
    previewBody.querySelectorAll('li > input[type="checkbox"]').forEach(cb => {
      cb.removeAttribute('disabled')
      cb.classList.add('task-list-checkbox')
      cb.parentElement.classList.add('task-list-item')
    })

    // Mermaid lazy rendering
    mermaidIdCounter = 0
    const mermaidBlocks = previewBody.querySelectorAll('.mermaid-block:not(.mermaid-rendered)')
    if (mermaidBlocks.length && window.mermaid) {
      mermaidBlocks.forEach(block => {
        const src = block.getAttribute('data-mermaid-src') || block.textContent
        if (mermaidCache.has(src)) {
          if (block.innerHTML !== mermaidCache.get(src)) block.innerHTML = mermaidCache.get(src)
          block.classList.add('mermaid-rendered')
        } else {
          if (!mermaidObserver) {
            mermaidObserver = new IntersectionObserver((entries) => {
              entries.forEach(entry => {
                if (entry.isIntersecting) { const b = entry.target; mermaidObserver.unobserve(b); renderMermaidBlock(b) }
              })
            }, { rootMargin: '200px 0px' })
          }
          mermaidObserver.observe(block)
        }
      })
    }

  }

  async function render(mdContent) {
    const mainArea = document.getElementById('main-area')
    if (mainArea && mainArea.classList.contains('view-editor-only')) {
      return
    }
    if (!previewBody) return

    try {
      let html
      if (markdownWorker) {
        html = await renderViaWorker(mdContent)
      } else {
        html = renderSync(mdContent)
      }
      applyHtml(html, mdContent)
    } catch (err) {
      console.error('[Preview] 渲染错误:', err)
      const errMsg = escapeHtml(err.message || String(err))
      previewBody.innerHTML = `<div class="render-error">\n  <div class="render-error-icon">⚠️</div>\n  <div class="render-error-msg">渲染错误：${errMsg}</div>\n  <button class="render-error-retry btn-secondary" onclick="PreviewManager.render(window.EditorManager ? EditorManager.getValue() : '')">重试</button>\n</div>`
    }
  }

  function syncPreviewScroll() {
    if (!syncScrollEnabled) return
    if ('editor' === scrollSource) return
    if (!window.EditorManager || !headingAnchors.length) return
    const container = document.getElementById('preview-container')
    if (!container) return
    const cm = EditorManager.getCM && EditorManager.getCM()
    if (!cm) return
    setScrollSource('preview')

    const scrollTop = container.scrollTop
    let anchorIdx = 0
    for (let i = 0; i < headingAnchors.length && headingAnchors[i].el.offsetTop <= scrollTop; i++) anchorIdx = i
    const current = headingAnchors[anchorIdx],
      next = headingAnchors[anchorIdx + 1]
    let targetLine
    if (next) {
      const ratio = (scrollTop - current.el.offsetTop) / Math.max(1, next.el.offsetTop - current.el.offsetTop)
      targetLine = current.line + (next.line - current.line) * Math.min(1, Math.max(0, ratio))
    } else targetLine = current.line
    cm.getScrollInfo()
    const coords = cm.charCoords({ line: Math.floor(targetLine), ch: 0 }, 'local')
    cm.scrollTo(null, Math.max(0, coords.top))
  }

  return {
    init: function () {
      previewBody = document.getElementById('preview-body')
      window.mermaid && mermaid.initialize({ startOnLoad: !1, theme: 'default', securityLevel: 'sandbox' })

      // 尝试创建 Web Worker 进行异步 Markdown 解析
      try {
        markdownWorker = new Worker('js/markdown-worker.js')
      } catch (_w) {
        markdownWorker = null  // Worker 创建失败时降级为同步解析
      }

      const renderer = new marked.Renderer(),
        headingCounters = new Map()

      renderer.code = (codeArg, lang) => {
        const text = 'object' == typeof codeArg && null !== codeArg ? codeArg.text : codeArg,
          language = 'object' == typeof codeArg && null !== codeArg ? codeArg.lang || lang || '' : lang || ''
        if ('mermaid' === language) {
          const id = 'mermaid-' + ++mermaidIdCounter
          return `<div class="mermaid-block" data-mermaid-src="${escapeHtml(text)}" id="${id}">${escapeHtml(text)}</div>`
        }
        let highlighted = escapeHtml(text)
        if (language && hljs.getLanguage(language))
          try {
            highlighted = hljs.highlight(text, { language: language }).value
          } catch (_err) {}
        else
          try {
            highlighted = hljs.highlightAuto(text).value
          } catch (_err) {}
        return `<pre class="code-pre"><button class="code-copy-btn" type="button" title="复制">复制</button><code class="hljs language-${language}">${highlighted}</code></pre>`
      }

      renderer.heading = (headingArg, depth, rawText) => {
        const text = 'object' == typeof headingArg && null !== headingArg ? headingArg.text || '' : headingArg,
          level = 'object' == typeof headingArg && null !== headingArg ? headingArg.depth : depth,
          raw = 'object' == typeof headingArg && null !== headingArg ? headingArg.raw || rawText : rawText || text,
          slug = (function (str) {
            return (
              String(str)
                .toLowerCase()
                .trim()
                .replace(/[\s\u3000]+/g, '-')
                .replace(/[^\w\u4e00-\u9fa5-]/g, '')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '') || 'h'
            )
          })(String(raw).replace(/<[^>]+>/g, '')),
          count = (headingCounters.get(slug) || 0) + 1
        headingCounters.set(slug, count)
        const id = 1 === count ? slug : `${slug}-${count}`
        return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${'object' == typeof headingArg && null !== headingArg && headingArg.tokens ? marked.parser(headingArg.tokens).replace(/^<p>|<\/p>\s*$/g, '') : String(text)}</h${level}>`
      }

      marked.setOptions({ breaks: !0, gfm: !0, renderer: renderer })

      const syncCheckbox = document.getElementById('sync-scroll')
      syncCheckbox.addEventListener('change', () => {
        syncScrollEnabled = syncCheckbox.checked
      })

      const previewContainer = document.getElementById('preview-container')
      previewContainer &&
        previewContainer.addEventListener('scroll', () => { syncPreviewScroll() }, { passive: !0 })

      previewBody.addEventListener('mousedown', evt => {
        evt.target.closest('li > input[type="checkbox"]') && evt.preventDefault()
      })

      previewBody.addEventListener('click', evt => {
        // Code copy button
        const copyBtn = evt.target.closest('.code-copy-btn')
        if (copyBtn) {
          const codeEl = copyBtn.parentElement.querySelector('code')
          return void (
            codeEl &&
            navigator.clipboard.writeText(codeEl.innerText).then(() => {
              const orig = copyBtn.textContent
              copyBtn.textContent = '已复制'
              copyBtn.classList.add('copied')
              setTimeout(() => {
                copyBtn.textContent = orig
                copyBtn.classList.remove('copied')
              }, 1200)
            })
          )
        }

        // Task list checkbox toggle
        const checkbox = evt.target.closest('li > input[type="checkbox"]')
        if (checkbox)
          return (
            evt.preventDefault(),
            void (function (checkbox) {
              if (!window.EditorManager) return
              const allCheckboxes = previewBody.querySelectorAll('li > input[type="checkbox"]'),
                idx = Array.prototype.indexOf.call(allCheckboxes, checkbox)
              if (idx < 0) return
              const cm = EditorManager.getCM && EditorManager.getCM()
              if (!cm) return
              const checkboxRe = /^(\s*(?:[-*+]|\d+\.)\s+)\[( |x|X)\]/
              let count = 0
              const lineCount = cm.lineCount()
              for (let i = 0; i < lineCount; i++) {
                const line = cm.getLine(i).match(checkboxRe)
                if (line) {
                  if (count === idx) {
                    const startCh = line[1].length + 1,
                      isChecked = 'x' === line[2].toLowerCase(),
                      newState = isChecked ? ' ' : 'x'
                    cm.replaceRange(newState, { line: i, ch: startCh }, { line: i, ch: startCh + 1 }, '+toggle')
                    return void (checkbox.checked = !isChecked)
                  }
                  count++
                }
              }
            })(checkbox)
          )

        // Image lightbox
        const img = evt.target.closest('img')
        img &&
          !evt.target.closest('a') &&
          (evt.preventDefault(),
            (function (src, alt) {
              closeLightbox()
              const overlay = document.createElement('div')
              overlay.className = 'image-lightbox'
              overlay.innerHTML = `\n      <button class="image-lightbox-close" type="button" title="关闭 (Esc)">✕</button>\n      <div class="image-lightbox-hint">100%</div>\n      <img alt="${escapeHtml(alt)}" draggable="false">\n    `
              const imgEl = overlay.querySelector('img')
              imgEl.src = src
              document.body.appendChild(overlay)
              document.body.style.overflow = 'hidden'
              lightboxEl = overlay

              const hintEl = overlay.querySelector('.image-lightbox-hint')
              imageState = { scale: 1, tx: 0, ty: 0, dragging: !1, sx: 0, sy: 0 }
              const updateTransform = () => {
                // 边缘吸附：缩放小于 1 时，吸附到居中位置
                if (imageState.scale < 1) {
                  imageState.tx = 0
                  imageState.ty = 0
                }
                imgEl.style.transform = `translate(${imageState.tx}px, ${imageState.ty}px) scale(${imageState.scale})`
                hintEl.textContent = Math.round(100 * imageState.scale) + '%'
                hintEl.classList.add('show')
                clearTimeout(hintEl._t)
                hintEl._t = setTimeout(() => hintEl.classList.remove('show'), 800)
              }
              overlay.addEventListener('wheel', evt => {
                evt.preventDefault()
                const rect = imgEl.getBoundingClientRect(),
                  cx = evt.clientX - (rect.left + rect.width / 2),
                  cy = evt.clientY - (rect.top + rect.height / 2),
                  factor = evt.deltaY < 0 ? 1.1 : 1 / 1.1,
                  newScale = Math.min(8, Math.max(0.2, imageState.scale * factor)),
                  ratio = newScale / imageState.scale
                imageState.tx = (imageState.tx - cx) * ratio + cx
                imageState.ty = (imageState.ty - cy) * ratio + cy
                imageState.scale = newScale
                updateTransform()
              }, { passive: !1 })

              const onMouseMove = evt => {
                  imageState && imageState.dragging && ((imageState.tx = evt.clientX - imageState.sx), (imageState.ty = evt.clientY - imageState.sy), updateTransform())
                },
                onMouseUp = () => {
                  imageState && (imageState.dragging = !1)
                  imgEl && imgEl.classList.remove('dragging')
                }
              imgEl.addEventListener('mousedown', evt => {
                evt.preventDefault()
                imageState.dragging = !0
                imageState.sx = evt.clientX - imageState.tx
                imageState.sy = evt.clientY - imageState.ty
                imgEl.classList.add('dragging')
              })
              // 触摸事件支持：拖拽平移
              const onTouchStart = evt => {
                if (1 === evt.touches.length) {
                  evt.preventDefault()
                  imageState.dragging = !0
                  imageState.sx = evt.touches[0].clientX - imageState.tx
                  imageState.sy = evt.touches[0].clientY - imageState.ty
                  imgEl.classList.add('dragging')
                }
              }
              const onTouchMove = evt => {
                if (1 === evt.touches.length && imageState && imageState.dragging) {
                  evt.preventDefault()
                  imageState.tx = evt.touches[0].clientX - imageState.sx
                  imageState.ty = evt.touches[0].clientY - imageState.sy
                  updateTransform()
                }
              }
              const onTouchEnd = () => {
                if (imageState) {
                  imageState.dragging = !1
                  imgEl && imgEl.classList.remove('dragging')
                }
              }
              imgEl.addEventListener('touchstart', onTouchStart, { passive: !1 })
              imgEl.addEventListener('touchmove', onTouchMove, { passive: !1 })
              imgEl.addEventListener('touchend', onTouchEnd)
              window.addEventListener('mousemove', onMouseMove)
              window.addEventListener('mouseup', onMouseUp)
              imgEl.addEventListener('dblclick', () => {
                imageState.scale = 1
                imageState.tx = 0
                imageState.ty = 0
                updateTransform()
              })
              overlay.addEventListener('click', evt => {
                (evt.target === overlay || evt.target.closest('.image-lightbox-close')) && closeLightbox()
              })
              const onKeydown = evt => { 'Escape' === evt.key && closeLightbox() }
              document.addEventListener('keydown', onKeydown)
              overlay._cleanup = () => {
                window.removeEventListener('mousemove', onMouseMove)
                window.removeEventListener('mouseup', onMouseUp)
                document.removeEventListener('keydown', onKeydown)
              }
            })(img.src, img.alt || ''))
      })
    },
    render: render,
    syncEditorScroll: function (ratio, lineNum) {
      if (!syncScrollEnabled) return
      if ('preview' === scrollSource) return
      const container = document.getElementById('preview-container')
      if (!container) return
      setScrollSource('editor')
      if (headingAnchors.length && 'number' == typeof lineNum) {
        const range = (function (line) {
          if (!headingAnchors.length) return null
          let lo = 0,
            hi = headingAnchors.length - 1,
            mid = 0
          for (; lo <= hi; ) {
            const idx = (lo + hi) >> 1
            headingAnchors[idx].line <= line ? ((mid = idx), (lo = idx + 1)) : (hi = idx - 1)
          }
          return { a: headingAnchors[mid], b: headingAnchors[mid + 1] }
        })(lineNum)
        if (range && range.a) {
          const { a, b } = range,
            baseTop = a.el.offsetTop
          let targetTop = baseTop
          if (b) {
            const t = (lineNum - a.line) / Math.max(1, b.line - a.line)
            targetTop = baseTop + (b.el.offsetTop - baseTop) * Math.min(1, Math.max(0, t))
          }
          return void (container.scrollTop = targetTop)
        }
      }
      const maxScroll = container.scrollHeight - container.clientHeight
      container.scrollTop = maxScroll * ratio
    },
    syncPreviewScroll: syncPreviewScroll,
    updateTheme: function (isDark) {
      const linkEl = document.getElementById('hljs-theme')
      if (linkEl) linkEl.href = `vendor/hljs/styles/${isDark ? 'github-dark' : 'github'}.min.css`
      window.mermaid &&
        (mermaid.initialize({ startOnLoad: !1, theme: isDark ? 'dark' : 'default', securityLevel: 'sandbox' }),
          window.EditorManager && render(EditorManager.getValue()))
    },
  }
})()
