/**
 * deobfuscate.js — 一次性地将 renderer/js/ 中的混淆代码格式化为可读源码。
 * 使用 Terser 的 beautify 模式：格式化代码，保留变量名。
 */
const fs = require('fs')
const path = require('path')
const Terser = require('terser')

const ROOT = path.resolve(__dirname, '..')
const JS_DIR = path.join(ROOT, 'renderer', 'js')

const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js'))

;(async () => {
  let ok = 0, fail = 0
  for (const file of files) {
    const fullPath = path.join(JS_DIR, file)
    const code = fs.readFileSync(fullPath, 'utf8')
    try {
      const result = await Terser.minify(code, {
        compress: false,
        mangle: false,
        output: {
          beautify: true,
          indent_level: 2,
          comments: false,
        },
      })
      if (result.error) throw result.error
      fs.writeFileSync(fullPath, result.code)
      console.log(`✅ ${file}: ${(code.length/1024).toFixed(1)}KB → ${(result.code.length/1024).toFixed(1)}KB`)
      ok++
    } catch (e) {
      console.error(`❌ ${file}: ${e.message}`)
      fail++
    }
  }
  console.log(`\n完成: ${ok} 成功, ${fail} 失败`)
})().catch(console.error)
