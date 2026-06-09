/**
 * dedupe-css-vars.js — 合并 CSS 中 7 个 .theme-light / 5 个 .theme-dark 重复变量声明块
 * 保留每个变量的最后一次赋值，消除冗余
 */
const fs = require('fs')

const css = fs.readFileSync('renderer/css/main.css', 'utf8')

// 收集所有 .theme-light{N} / .theme-dark{N} 块，分离纯变量块和 CSS 规则块
function findBlocks(selector) {
  const varBlocks = []   // 纯 CSS 变量声明块（所有声明以 -- 开头）
  const ruleBlocks = []  // 包含 CSS 属性声明的块
  let pos = 0
  while ((pos = css.indexOf(selector + '{', pos)) !== -1) {
    const start = pos + selector.length + 1
    const end = css.indexOf('}', start)
    const content = css.slice(start, end)
    const decls = content.split(';').filter(Boolean)
    const isPureVars = decls.every(d => d.trim().startsWith('--'))
    ;(isPureVars ? varBlocks : ruleBlocks).push({ start: pos, end: end + 1, content })
    pos = end + 1
  }
  return { varBlocks, ruleBlocks }
}

const light = findBlocks('.theme-light')
const dark = findBlocks('.theme-dark')

console.log('.theme-light: ' + light.varBlocks.length + ' 变量块, ' + light.ruleBlocks.length + ' 规则块')
console.log('.theme-dark: ' + dark.varBlocks.length + ' 变量块, ' + dark.ruleBlocks.length + ' 规则块')

// 合并所有纯变量块：最后一次赋值有效
function mergeVarBlocks(blocks) {
  const vars = {}
  blocks.forEach(b => {
    b.content.split(';').filter(Boolean).forEach(decl => {
      const idx = decl.indexOf(':')
      if (idx > 0) vars[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim()
    })
  })
  const entries = Object.entries(vars)
  if (entries.length === 0) return ''
  return entries.map(([k, v]) => k + ':' + v).join(';') + ';'
}

const lightVars = mergeVarBlocks(light.varBlocks)
const darkVars = mergeVarBlocks(dark.varBlocks)

console.log('合并后 light 变量: ' + Object.keys(lightVars).length + ' 个声明')
console.log('合并后 dark 变量: ' + Object.keys(darkVars).length + ' 个声明')

// 从原始 CSS 中移除所有纯变量块（从后往前删，避免位置偏移）
let result = css
;[...light.varBlocks, ...dark.varBlocks]
  .sort((a, b) => b.start - a.start) // 从后往前
  .forEach(b => {
    result = result.slice(0, b.start) + result.slice(b.end)
  })

// 在文件末尾追加合并后的变量块
const finalBlock = '.theme-light{' + lightVars + '}.theme-dark{' + darkVars + '}'
result = result.replace(/([^}])\s*$/, '$1') // 确保末尾有换行
result += '\n' + finalBlock

fs.writeFileSync('renderer/css/main.css', result)

// 统计
const origSize = css.length
const newSize = result.length
console.log('\nCSS 体积: ' + origSize + ' → ' + newSize + ' bytes (-' + (origSize - newSize) + ', ' + ((1 - newSize / origSize) * 100).toFixed(1) + '%)')
