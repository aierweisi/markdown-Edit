/**
 * make-ico.js
 * 用 Electron BrowserWindow 把 SVG 渲染成 PNG(Electron 28+ 的 nativeImage 不再支持
 * SVG data URL → PNG 直转), 再合并成多尺寸 ICO。
 * Run inside Electron context: ./node_modules/electron/dist/electron.exe make-ico.js
 */

const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const iconDir = path.join(__dirname, 'assets', 'icons')
const ALL_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const BIG = 1024

app.whenReady().then(async () => {
  try {
    const svgPath = path.join(iconDir, `icon-${BIG}.svg`)
    if (!fs.existsSync(svgPath)) throw new Error(`missing ${svgPath} — run "node generate-icon.js" first`)

    const svg = fs.readFileSync(svgPath, 'utf-8')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html, body { margin:0; padding:0; background:transparent; width:${BIG}px; height:${BIG}px; overflow:hidden; }
      svg { display:block; width:${BIG}px; height:${BIG}px; }
    </style></head><body>${svg}</body></html>`

    const win = new BrowserWindow({
      width: BIG, height: BIG,
      useContentSize: true,
      show: false,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: false }
    })

    const dataUrl = 'data:text/html;base64,' + Buffer.from(html, 'utf-8').toString('base64')
    await win.loadURL(dataUrl)
    // 等浏览器排版 + 字体加载完成
    await new Promise(r => setTimeout(r, 500))

    const img = await win.webContents.capturePage()
    const pngBig = img.toPNG()
    if (pngBig.length === 0) throw new Error('capturePage returned empty buffer')
    console.log(`Captured ${BIG}×${BIG}: ${pngBig.length} bytes`)

    // 用大图做基准, 缩到各个目标尺寸 (best 质量, 用 lanczos)
    const baseImg = nativeImage.createFromBuffer(pngBig)
    const pngBuffers = {}
    for (const size of ALL_SIZES) {
      const resized = size === BIG ? baseImg
        : baseImg.resize({ width: size, height: size, quality: 'best' })
      const buf = resized.toPNG()
      pngBuffers[size] = buf
      fs.writeFileSync(path.join(iconDir, `icon-${size}.png`), buf)
      console.log(`PNG ${size}: ${buf.length} bytes`)
    }

    // 多尺寸 PNG 合并成 ICO
    const images = ICO_SIZES.filter(s => pngBuffers[s] && pngBuffers[s].length > 0)
      .map(s => ({ size: s, data: pngBuffers[s] }))

    const headerSize = 6
    const dirEntrySize = 16
    const dirSize = images.length * dirEntrySize
    let offset = headerSize + dirSize

    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0)              // Reserved
    header.writeUInt16LE(1, 2)              // Type 1 = ICO
    header.writeUInt16LE(images.length, 4)  // # images

    const directory = Buffer.alloc(dirSize)
    images.forEach((im, i) => {
      const s = im.size >= 256 ? 0 : im.size  // 0 means 256 in ICO spec
      const off = i * dirEntrySize
      directory.writeUInt8(s, off)
      directory.writeUInt8(s, off + 1)
      directory.writeUInt8(0, off + 2)         // color count
      directory.writeUInt8(0, off + 3)         // reserved
      directory.writeUInt16LE(1, off + 4)      // color planes
      directory.writeUInt16LE(32, off + 6)     // bits per pixel
      directory.writeUInt32LE(im.data.length, off + 8)
      directory.writeUInt32LE(offset, off + 12)
      offset += im.data.length
    })

    const icoBuffer = Buffer.concat([header, directory, ...images.map(i => i.data)])
    const icoPath = path.join(iconDir, 'icon.ico')
    fs.writeFileSync(icoPath, icoBuffer)
    console.log(`\nICO: ${icoPath} (${icoBuffer.length} bytes, sizes: ${images.map(i => i.size).join(', ')})`)

    // 主 icon.png (256 作为默认)
    if (pngBuffers[256]) {
      fs.writeFileSync(path.join(iconDir, 'icon.png'), pngBuffers[256])
      console.log(`PNG main: icon.png (256×256)`)
    }

    win.destroy()
    app.exit(0)
  } catch (e) {
    console.error('Error:', e)
    app.exit(1)
  }
})
