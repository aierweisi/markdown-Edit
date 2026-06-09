/**
 * analyze-css.js — 分析 CSS 中 .theme-light / .theme-dark 重复声明
 */
const fs = require('fs')
const css = fs.readFileSync('renderer/css/main.css', 'utf8')

function extractThemeVars(selector) {
  const vars = {}
  let pos = 0
  while ((pos = css.indexOf(selector + '{', pos)) !== -1) {
    const start = pos + selector.length + 1
    const end = css.indexOf('}', start)
    const content = css.slice(start, end)
    content.split(';').filter(Boolean).forEach(decl => {
      const idx = decl.indexOf(':')
      if (idx > 0) {
        vars[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim()
      }
    })
    pos = end + 1
  }
  return vars
}

const light = extractThemeVars('.theme-light')
const dark = extractThemeVars('.theme-dark')

console.log('.theme-light blocks:', Object.keys(light).length, 'unique vars')
for (const [k, v] of Object.entries(light)) {
  console.log('  --' + k + ' =', v.slice(0, 60) + (v.length > 60 ? '...' : ''))
}

console.log('\n.theme-dark blocks:', Object.keys(dark).length, 'unique vars')
for (const [k, v] of Object.entries(dark)) {
  console.log('  --' + k + ' =', v.slice(0, 60) + (v.length > 60 ? '...' : ''))
}
