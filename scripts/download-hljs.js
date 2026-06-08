// Download highlight.js v11.11.1 from CDN
const https = require('https')
const fs = require('fs')

const url = 'https://unpkg.com/@highlightjs/cdn-assets@11.11.1/dist/highlight.min.js'
const dest = 'renderer/vendor/hljs/highlight.min.js'

https.get(url, { timeout: 15000 }, res => {
  if (res.statusCode !== 200) {
    console.error('HTTP', res.statusCode)
    process.exit(1)
  }
  const file = fs.createWriteStream(dest)
  res.pipe(file)
  file.on('finish', () => {
    file.close()
    const c = fs.readFileSync(dest, 'utf8').slice(0, 200)
    const m = c.match(/Highlight\.js v(\S+)/)
    console.log('Downloaded', m ? 'v' + m[1] : '?', fs.statSync(dest).size + ' bytes')
  })
}).on('error', e => { console.error(e.message); process.exit(1) })
