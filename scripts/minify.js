/**
 * minify.js — Build-time JS/CSS/HTML 压缩
 * 在 electron-builder 打包前运行, 就地覆盖源文件。
 * 恢复方式: `git checkout -- renderer/js/ renderer/css/ renderer/index.html main/`
 */
const fs = require('fs')
const path = require('path')
const Terser = require('terser')
const csso = require('csso')

const ROOT = path.resolve(__dirname, '..')

// ====== JS 文件 ======
const jsFiles = [
  // renderer JS
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
  // main process JS
  'main/main.js',
  'main/preload.js',
]

// ====== CSS 文件 ======
const cssFiles = [
  'renderer/css/main.css',
]

// ====== HTML 文件 ======
const htmlFiles = [
  'renderer/index.html',
]

async function minifyJS(filePath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const result = await Terser.minify(code, {
    compress: { passes: 2, drop_console: false },
    mangle: { reserved: ['EditorManager', 'PreviewManager', 'SettingsManager', 'CacheManager', 'ExportManager', 'FindManager', 'TabManager', 'RecentManager', 'TemplateManager'] },
  })
  if (result.error) {
    console.error(`[minify] JS 失败: ${path.relative(ROOT, filePath)} — ${result.error.message}`)
    return false
  }
  fs.writeFileSync(filePath, result.code, 'utf8')
  return true
}

function minifyCSS(filePath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const result = csso.minify(code)
  fs.writeFileSync(filePath, result.css, 'utf8')
  return true
}

function minifyHTML(filePath) {
  let html = fs.readFileSync(filePath, 'utf8')
  // 去除多余空白
  html = html.replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\n/g, '')
  fs.writeFileSync(filePath, html.trim(), 'utf8')
  return true
}

;(async () => {
  console.log('=== 开始压缩 ===')
  let ok = 0, fail = 0

  for (const rel of jsFiles) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) {
      console.warn(`[skip] 不存在: ${rel}`)
      continue
    }
    if (await minifyJS(full)) {
      console.log(`[JS]    ✅ ${rel}`)
      ok++
    } else {
      fail++
    }
  }

  for (const rel of cssFiles) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) {
      console.warn(`[skip] 不存在: ${rel}`)
      continue
    }
    minifyCSS(full)
    console.log(`[CSS]   ✅ ${rel}`)
    ok++
  }

  for (const rel of htmlFiles) {
    const full = path.join(ROOT, rel)
    if (!fs.existsSync(full)) {
      console.warn(`[skip] 不存在: ${rel}`)
      continue
    }
    minifyHTML(full)
    console.log(`[HTML]  ✅ ${rel}`)
    ok++
  }

  console.log(`\n压缩完成: ${ok} 成功, ${fail} 失败`)
  if (fail) process.exitCode = 1
})()
