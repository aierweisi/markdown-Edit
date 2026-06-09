/**
 * copy-vendor.js — 将 npm 依赖中的库文件复制到 renderer/vendor/
 *
 * 在 npm install 后（postinstall）或构建前自动执行。
 * 确保 HTML 中 <script src="vendor/..."> 引用的文件始终与 npm 依赖同步。
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const VENDOR = path.join(ROOT, 'renderer', 'vendor')

// 文件映射: [源路径(相对 node_modules), 目标路径(相对 vendor)]
const COPY_MAP = [
  // ── CodeMirror 5 ────────────────────────────────────────
  ['codemirror/lib/codemirror.js',                     'codemirror/codemirror.min.js'],
  ['codemirror/lib/codemirror.css',                    'codemirror/codemirror.min.css'],
  ['codemirror/mode/markdown/markdown.js',              'codemirror/mode/markdown/markdown.min.js'],
  ['codemirror/addon/edit/continuelist.js',             'codemirror/addon/edit/continuelist.min.js'],
  ['codemirror/addon/selection/active-line.js',         'codemirror/addon/selection/active-line.min.js'],
  ['codemirror/addon/display/placeholder.js',           'codemirror/addon/display/placeholder.min.js'],
  ['codemirror/addon/dialog/dialog.js',                 'codemirror/addon/dialog/dialog.min.js'],
  ['codemirror/addon/dialog/dialog.css',                'codemirror/dialog.min.css'],
  ['codemirror/addon/search/searchcursor.js',           'codemirror/addon/search/searchcursor.min.js'],
  ['codemirror/addon/search/match-highlighter.js',      'codemirror/addon/search/match-highlighter.min.js'],
  ['codemirror/addon/scroll/annotatescrollbar.js',      'codemirror/addon/scroll/annotatescrollbar.min.js'],
  ['codemirror/addon/search/matchesonscrollbar.js',     'codemirror/addon/search/matchesonscrollbar.min.js'],
  ['codemirror/addon/search/matchesonscrollbar.css',    'codemirror/matchesonscrollbar.min.css'],
  ['codemirror/addon/search/jump-to-line.js',           'codemirror/addon/search/jump-to-line.min.js'],

  // ── marked ─────────────────────────────────────────────
  ['marked/marked.min.js',                              'marked/marked.min.js'],

  // ── DOMPurify ──────────────────────────────────────────
  ['dompurify/dist/purify.min.js',                      'dompurify/purify.min.js'],

  // ── KaTeX ──────────────────────────────────────────────
  ['katex/dist/katex.min.js',                           'katex/katex.min.js'],
  ['katex/dist/katex.min.css',                          'katex/katex.min.css'],
  ['katex/dist/contrib/auto-render.min.js',             'katex/contrib/auto-render.min.js'],
  // KaTeX 字体
  ...(() => {
    const fontDir = path.join(ROOT, 'node_modules', 'katex', 'dist', 'fonts')
    if (!fs.existsSync(fontDir)) return []
    return fs.readdirSync(fontDir)
      .filter(f => f.endsWith('.woff2'))
      .map(f => ['katex/dist/fonts/' + f, 'katex/fonts/' + f])
  })(),

  // ── Mermaid ────────────────────────────────────────────
  ['mermaid/dist/mermaid.min.js',                       'mermaid/mermaid.min.js'],

  // ── highlight.js ───────────────────────────────────────
  ['@highlightjs/cdn-assets/highlight.min.js',                'hljs/highlight.min.js'],
  ['@highlightjs/cdn-assets/styles/github.min.css',            'hljs/styles/github.min.css'],
  ['@highlightjs/cdn-assets/styles/github-dark.min.css',       'hljs/styles/github-dark.min.css'],
]

function copyFile(srcRel, destRel) {
  const src = path.join(ROOT, 'node_modules', srcRel.replace(/\//g, path.sep))
  const dest = path.join(VENDOR, destRel.replace(/\//g, path.sep))
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠  跳过（源文件不存在）: ${srcRel}`)
    return false
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  return true
}

let ok = 0
let skip = 0
let fail = 0

for (const [srcRel, destRel] of COPY_MAP) {
  try {
    if (copyFile(srcRel, destRel)) {
      console.log(`  ✅ ${destRel}`)
      ok++
    } else {
      skip++
    }
  } catch (e) {
    console.error(`  ❌ ${destRel}: ${e.message}`)
    fail++
  }
}

console.log(`\n复制完成: ${ok} 成功, ${skip} 跳过, ${fail} 失败`)
if (fail) process.exitCode = 1
