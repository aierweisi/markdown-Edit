/**
 * minify.js — Build-time JS/CSS/HTML 压缩
 * 输出到 dist/ 目录，不覆盖源文件。
 * 配合 package.json 中 files 字段打包 dist/ 下的产物。
 */
const fs = require('fs')
const path = require('path')
const Terser = require('terser')
const csso = require('csso')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'dist')

// ====== JS 文件（仅渲染进程） ======
const jsFiles = [
  'renderer/js/app.js',
  'renderer/js/cache.js',
  'renderer/js/editor.js',
  'renderer/js/export.js',
  'renderer/js/find.js',
  'renderer/js/palette.js',
  'renderer/js/preview.js',
  'renderer/js/recent.js',
  'renderer/js/settings.js',
  'renderer/js/tabs.js',
  'renderer/js/templates.js',
  'renderer/js/utils.js',
]

// ====== CSS 文件 ======
const cssFiles = [
  'renderer/css/main.css',
]

// ====== HTML 文件 ======
const htmlFiles = [
  'renderer/index.html',
]

// ====== vendor 文件（仅复制，不压缩） ======
// 自动扫描 renderer/vendor/ 下所有子目录中的文件
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
      result.push({ rel: 'renderer/' + prefix + '/' + name, abs: full })
    }
  }
}

async function minifyJS(filePath, outPath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const result = await Terser.minify(code, {
    compress: { passes: 2, drop_console: false },
    mangle: { reserved: ['TabManager', 'EditorManager', 'PreviewManager', 'ExportManager', 'FindManager', 'CacheManager', 'SettingsManager', 'TemplateManager', 'CommandPalette', 'RecentFiles', 'CodeMirror', 'marked', 'DOMPurify', 'katex', 'mermaid', 'hljs'] },
    output: { comments: false },
    sourceMap: false,
  })
  if (result.error) throw result.error
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, result.code)
  if (result.map) fs.writeFileSync(outPath + '.map', result.map)
}

function minifyCSS(filePath, outPath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const result = csso.minify(code, { restructure: true })
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, result.css)
}

function minifyHTML(filePath, outPath) {
  let html = fs.readFileSync(filePath, 'utf8')
  // 注意：HTML 中引用的 vendor/ 路径不变，仅复制 vendor 到 dist 对应位置
  // 简单去除多余空白
  html = html.replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, html)
}

(async () => {
  console.log('[minify] 开始压缩...\n')
  let ok = 0, fail = 0

  for (const rel of jsFiles) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) {
      console.warn(`[skip] 不存在: ${rel}`)
      continue
    }
    try {
      const outRel = rel.replace(/^renderer\//, '')
      const outPath = path.join(OUT, outRel)
      await minifyJS(full, outPath)
      console.log(`[JS]    ✅ ${rel} → dist/${outRel}`)
      ok++
    } catch (e) {
      console.error(`[JS]    ❌ ${rel}: ${e.message}`)
      fail++
    }
  }

  for (const rel of cssFiles) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) {
      console.warn(`[skip] 不存在: ${rel}`)
      continue
    }
    try {
      const outRel = rel.replace(/^renderer\//, '')
      const outPath = path.join(OUT, outRel)
      minifyCSS(full, outPath)
      console.log(`[CSS]   ✅ ${rel} → dist/${outRel}`)
      ok++
    } catch (e) {
      console.error(`[CSS]   ❌ ${rel}: ${e.message}`)
      fail++
    }
  }

  for (const rel of htmlFiles) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) {
      console.warn(`[skip] 不存在: ${rel}`)
      continue
    }
    try {
      const outRel = rel.replace(/^renderer\//, '')
      const outPath = path.join(OUT, outRel)
      minifyHTML(full, outPath)
      console.log(`[HTML]  ✅ ${rel} → dist/${outRel}`)
      ok++
    } catch (e) {
      console.error(`[HTML]  ❌ ${rel}: ${e.message}`)
      fail++
    }
  }

  // 复制 vendor 文件
  const vendorFiles = collectVendorFiles()
  let vendorCopied = 0
  for (const { rel, abs } of vendorFiles) {
    const outRel = rel.replace(/^renderer\//, '')
    const outPath = path.join(OUT, outRel)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.copyFileSync(abs, outPath)
    vendorCopied++
  }
  console.log(`[Vendor] ✅ 复制 ${vendorCopied} 个 vendor 文件到 dist/`)

  // 复制 assets 目录
  const assetsDir = path.join(ROOT, 'assets')
  const assetsOut = path.join(OUT, 'assets')
  if (fs.existsSync(assetsDir)) {
    copyDirSync(assetsDir, assetsOut)
    console.log(`[Assets] ✅ 复制 assets/ 到 dist/`)
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
