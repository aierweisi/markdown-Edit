/**
 * minify.js — Build-time JS/CSS/HTML 压缩
 * 从 src/ 读取可读源码，压缩后输出到 dist/，供 electron-builder 打包。
 * 不覆盖 renderer/ 下的开发文件。
 */
const fs = require('fs')
const path = require('path')
const Terser = require('terser')
const csso = require('csso')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(ROOT, 'dist')

// ====== JS 文件（从 src/js/ 读取） ======
const jsFiles = [
  'app.js',
  'cache.js',
  'editor.js',
  'export.js',
  'find.js',
  'palette.js',
  'preview.js',
  'recent.js',
  'settings.js',
  'tabs.js',
  'templates.js',
  'utils.js',
]

// ====== CSS 文件（从 src/css/ 读取） ======
const cssFiles = [
  'main.css',
]

// ====== HTML 文件（从 src/ 读取） ======
const htmlFiles = [
  'index.html',
]

// ====== Vendor 文件（从 renderer/vendor/ 复制） ======
function collectVendorFiles() {
  const vendorDir = path.join(ROOT, 'renderer', 'vendor')
  const files = []
  if (!fs.existsSync(vendorDir)) return files
  for (const subdir of fs.readdirSync(vendorDir)) {
    const subPath = path.join(vendorDir, subdir)
    if (!fs.statSync(subPath).isDirectory()) continue
    collectFiles(subPath, files, 'vendor/' + subdir)
  }
  return files
}

function collectFiles(dir, result, prefix) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      collectFiles(full, result, prefix + '/' + name)
    } else {
      result.push({ rel: prefix + '/' + name, abs: full })
    }
  }
}

async function minifyJS(inPath, outPath) {
  const code = fs.readFileSync(inPath, 'utf8')
  const result = await Terser.minify(code, {
    compress: { passes: 2, drop_console: false },
    mangle: {
      reserved: [
        'TabManager', 'EditorManager', 'PreviewManager',
        'ExportManager', 'FindManager', 'CacheManager',
        'SettingsManager', 'TemplateManager', 'CommandPalette',
        'RecentFiles', 'CodeMirror', 'marked', 'DOMPurify',
        'katex', 'mermaid', 'hljs',
      ],
    },
    output: { comments: false },
    sourceMap: true,
  })
  if (result.error) throw result.error
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, result.code)
  if (result.map) fs.writeFileSync(outPath + '.map', result.map)
}

function minifyCSS(inPath, outPath) {
  const code = fs.readFileSync(inPath, 'utf8')
  const result = csso.minify(code, { restructure: true })
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, result.css)
}

function minifyHTML(inPath, outPath) {
  let html = fs.readFileSync(inPath, 'utf8')
  html = html.replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, html)
}

;(async () => {
  console.log('[minify] 从 src/ 开始压缩...\n')
  let ok = 0, fail = 0

  // JS 文件
  for (const name of jsFiles) {
    const inPath = path.join(SRC, 'js', name)
    if (!fs.existsSync(inPath)) {
      console.warn(`[skip] 不存在: src/js/${name}`)
      continue
    }
    try {
      const outPath = path.join(OUT, 'js', name)
      await minifyJS(inPath, outPath)
      console.log(`[JS]    ✅ src/js/${name} → dist/js/${name}`)
      ok++
    } catch (e) {
      console.error(`[JS]    ❌ src/js/${name}: ${e.message}`)
      fail++
    }
  }

  // CSS 文件
  for (const name of cssFiles) {
    const inPath = path.join(SRC, 'css', name)
    if (!fs.existsSync(inPath)) {
      console.warn(`[skip] 不存在: src/css/${name}`)
      continue
    }
    try {
      const outPath = path.join(OUT, 'css', name)
      minifyCSS(inPath, outPath)
      console.log(`[CSS]   ✅ src/css/${name} → dist/css/${name}`)
      ok++
    } catch (e) {
      console.error(`[CSS]   ❌ src/css/${name}: ${e.message}`)
      fail++
    }
  }

  // HTML 文件
  for (const name of htmlFiles) {
    const inPath = path.join(SRC, name)
    if (!fs.existsSync(inPath)) {
      console.warn(`[skip] 不存在: src/${name}`)
      continue
    }
    try {
      const outPath = path.join(OUT, name)
      minifyHTML(inPath, outPath)
      console.log(`[HTML]  ✅ src/${name} → dist/${name}`)
      ok++
    } catch (e) {
      console.error(`[HTML]  ❌ src/${name}: ${e.message}`)
      fail++
    }
  }

  // 复制 vendor 文件（从 renderer/vendor/ 到 dist/vendor/）
  const vendorFiles = collectVendorFiles()
  let vendorCopied = 0
  for (const { rel, abs } of vendorFiles) {
    const outPath = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.copyFileSync(abs, outPath)
    vendorCopied++
  }
  console.log(`[Vendor] ✅ 复制 ${vendorCopied} 个 vendor 文件到 dist/`)

  // 复制 main 进程文件
  const mainFiles = [
    { src: 'main/main.js', inPath: path.join(ROOT, 'main/main.js') },
    { src: 'main/preload.js', inPath: path.join(ROOT, 'main/preload.js') },
  ]
  for (const { src, inPath } of mainFiles) {
    const outPath = path.join(OUT, src)
    if (fs.existsSync(inPath)) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true })
      fs.copyFileSync(inPath, outPath)
      console.log(`[Main]   ✅ ${src} → dist/${src}`)
      ok++
    } else {
      console.warn(`[skip] 不存在: ${src}`)
    }
  }

  // 复制 assets 目录
  const assetsDir = path.join(ROOT, 'assets')
  const assetsOut = path.join(OUT, 'assets')
  if (fs.existsSync(assetsDir)) {
    copyDirSync(assetsDir, assetsOut)
    console.log('[Assets] ✅ 复制 assets/ 到 dist/')
  }

  console.log(`\n压缩完成: ${ok} 成功, ${fail} 失败, ${vendorCopied} vendor 已复制`)
  if (fail) process.exitCode = 1
})()

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name)
    const d = path.join(dest, name)
    if (fs.statSync(s).isDirectory()) {
      copyDirSync(s, d)
    } else {
      fs.copyFileSync(s, d)
    }
  }
}
