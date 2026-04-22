/**
 * make-ico.js
 * Uses Electron's nativeImage to convert SVG→PNG, then builds a proper ICO file.
 * Run inside Electron context: electron make-ico.js
 */

const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const iconDir = path.join(__dirname, 'assets', 'icons')

// ICO sizes we want in the file
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

app.whenReady().then(async () => {
  try {
    const pngBuffers = {}

    for (const size of ICO_SIZES) {
      const svgPath = path.join(iconDir, `icon-${size}.svg`)
      // Use closest available SVG
      const availSvgs = [svgPath,
        path.join(iconDir, 'icon-512.svg'),
        path.join(iconDir, 'icon.svg')
      ]
      let svgFile = null
      for (const p of availSvgs) {
        if (fs.existsSync(p)) { svgFile = p; break }
      }
      if (!svgFile) continue

      const svgContent = fs.readFileSync(svgFile, 'utf-8')
      // Create nativeImage from SVG data URL
      const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svgContent).toString('base64')
      const img = nativeImage.createFromDataURL(dataUrl)
      const resized = img.resize({ width: size, height: size, quality: 'best' })
      pngBuffers[size] = resized.toPNG()
      console.log(`PNG ${size}x${size}: ${pngBuffers[size].length} bytes`)

      // Save individual PNG
      fs.writeFileSync(path.join(iconDir, `icon-${size}.png`), pngBuffers[size])
    }

    // Build ICO file
    // ICO format: header (6 bytes) + directory entries (16 bytes each) + image data
    const images = ICO_SIZES.filter(s => pngBuffers[s]).map(size => ({
      size, data: pngBuffers[size]
    }))

    const headerSize = 6
    const dirEntrySize = 16
    const dirSize = images.length * dirEntrySize
    let offset = headerSize + dirSize

    // Header
    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0)       // Reserved
    header.writeUInt16LE(1, 2)       // Type: 1 = ICO
    header.writeUInt16LE(images.length, 4)

    // Directory entries
    const directory = Buffer.alloc(dirSize)
    images.forEach((img, i) => {
      const s = img.size >= 256 ? 0 : img.size
      const off = i * dirEntrySize
      directory.writeUInt8(s, off)           // Width (0 = 256)
      directory.writeUInt8(s, off + 1)       // Height
      directory.writeUInt8(0, off + 2)       // Color count
      directory.writeUInt8(0, off + 3)       // Reserved
      directory.writeUInt16LE(1, off + 4)    // Color planes
      directory.writeUInt16LE(32, off + 6)   // Bits per pixel
      directory.writeUInt32LE(img.data.length, off + 8)  // Data size
      directory.writeUInt32LE(offset, off + 12)           // Data offset
      offset += img.data.length
    })

    const icoBuffer = Buffer.concat([header, directory, ...images.map(i => i.data)])
    const icoPath = path.join(iconDir, 'icon.ico')
    fs.writeFileSync(icoPath, icoBuffer)
    console.log(`\nICO written: ${icoPath} (${icoBuffer.length} bytes)`)
    console.log('Sizes included:', images.map(i => i.size).join(', '))

    // Also save the 512 PNG as main icon.png
    if (pngBuffers[128]) {
      fs.writeFileSync(path.join(iconDir, 'icon.png'), pngBuffers[128])
    }

    console.log('\nDone!')
    app.exit(0)
  } catch (e) {
    console.error('Error:', e)
    app.exit(1)
  }
})
