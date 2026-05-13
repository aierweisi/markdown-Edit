// electron-builder afterPack hook: 删除多余 Chromium 语言包,只保留 zh-CN 和 en-US
const fs = require('fs')
const path = require('path')

const KEEP = new Set(['zh-CN.pak', 'en-US.pak'])

exports.default = async function (context) {
  const localesDir = path.join(context.appOutDir, 'locales')
  if (!fs.existsSync(localesDir)) return

  let removed = 0
  let freed = 0
  for (const name of fs.readdirSync(localesDir)) {
    if (KEEP.has(name)) continue
    const full = path.join(localesDir, name)
    try {
      const size = fs.statSync(full).size
      fs.unlinkSync(full)
      removed++
      freed += size
    } catch (e) {
      console.warn(`[afterPack] failed to remove ${name}:`, e.message)
    }
  }
  console.log(`[afterPack] removed ${removed} locale files, freed ${(freed / 1024 / 1024).toFixed(2)} MB`)
}
