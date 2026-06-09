/**
 * markdown-worker.js — Web Worker for Markdown + KaTeX parsing
 * Runs marked.parse and katex.renderToString off the main thread.
 *
 * Loads vendored libraries via importScripts.
 * Communication: postMessage({ type, payload })
 */
self.importScripts('../vendor/marked/marked.min.js', '../vendor/katex/katex.min.js')

self.onmessage = function (e) {
  const { text } = e.data || {}
  if (typeof text !== 'string') {
    self.postMessage({ html: '', error: null })
    return
  }

  try {
    // Step 1: Extract math expressions (same logic as preview.js)
    const mathExprs = []
    const mathProcessed = text
      .replace(
        /\$\$([\s\S]+?)\$\$/g,
        (match, expr) => `\n\n@@MATHBLOCK${mathExprs.push({ display: true, expr }) - 1}@@\n\n`,
      )
      .replace(
        /(^|[^\\$])$([^$\n]+?)$(?!\d)/g,
        (match, before, expr) => `${before}@@MATHINLINE${mathExprs.push({ display: false, expr }) - 1}@@`,
      )

    // Step 2: Parse markdown
    let html = self.marked.parse(mathProcessed)

    // Step 3: Render math
    html = html
      .replace(/@@MATHBLOCK(\d+)@@/g, (match, idx) => {
        const expr = mathExprs[+idx]
        if (!expr) return ''
        try {
          return `<div class="math-block">${self.katex.renderToString(expr.expr, { displayMode: true, throwOnError: false })}</div>`
        } catch (err) {
          return `<pre class="math-error">${escapeHtml(expr.expr)}</pre>`
        }
      })
      .replace(/@@MATHINLINE(\d+)@@/g, (match, idx) => {
        const expr = mathExprs[+idx]
        if (!expr) return ''
        try {
          return self.katex.renderToString(expr.expr, { displayMode: false, throwOnError: false })
        } catch (err) {
          return `<code class="math-error">${escapeHtml(expr.expr)}</code>`
        }
      })

    self.postMessage({ html, error: null })
  } catch (err) {
    self.postMessage({ html: '', error: err.message || String(err) })
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  )
}
