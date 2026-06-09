/**
 * dev-build.js — 开发构建：将 src/ 下的可读源码复制到 renderer/
 * 不压缩、不混淆，保留变量名便于开发调试。
 * 用法: node scripts/dev-build.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const OUT = path.join(ROOT, 'renderer')

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

let ok = 0
let fail = 0

// 复制 npm 依赖的 vendor 文件（首次安装后 postinstall 已执行，开发中确保同步）
console.log('\n[Vendor] 同步 npm 依赖...')
try {
  require('./copy-vendor.js')
} catch (e) {
  console.error('[Vendor] 复制失败:', e.message)
  fail++
}

// JS 文件
const jsDir = path.join(SRC, 'js')
if (fs.existsSync(jsDir)) {
  const outJs = path.join(OUT, 'js')
  fs.mkdirSync(outJs, { recursive: true })
  for (const name of fs.readdirSync(jsDir)) {
    if (!name.endsWith('.js')) continue
    try {
      fs.copyFileSync(path.join(jsDir, name), path.join(outJs, name))
      console.log(`[JS]     ✅ ${name}`)
      ok++
    } catch (e) {
      console.error(`[JS]     ❌ ${name}: ${e.message}`)
      fail++
    }
  }
}

// CSS 文件
const cssSrc = path.join(SRC, 'css', 'main.css')
const cssOut = path.join(OUT, 'css', 'main.css')
if (fs.existsSync(cssSrc)) {
  try {
    fs.mkdirSync(path.dirname(cssOut), { recursive: true })
    fs.copyFileSync(cssSrc, cssOut)
    console.log(`[CSS]    ✅ main.css`)
    ok++
  } catch (e) {
    console.error(`[CSS]    ❌ main.css: ${e.message}`)
    fail++
  }
}

// HTML 文件
const htmlSrc = path.join(SRC, 'index.html')
const htmlOut = path.join(OUT, 'index.html')
if (fs.existsSync(htmlSrc)) {
  try {
    fs.copyFileSync(htmlSrc, htmlOut)
    console.log(`[HTML]   ✅ index.html`)
    ok++
  } catch (e) {
    console.error(`[HTML]   ❌ index.html: ${e.message}`)
    fail++
  }
}

console.log(`\n开发构建完成: ${ok} 成功, ${fail} 失败`)
if (fail) process.exitCode = 1
