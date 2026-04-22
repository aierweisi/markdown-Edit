/**
 * generate-icon.js
 * Generates a high-quality app icon as PNG using pure SVG + Electron's nativeImage
 * Run: node generate-icon.js
 */

const fs = require('fs')
const path = require('path')

// SVG icon design: dark rounded square with "M↓" mark
function buildSVG(size) {
  const r = Math.round(size * 0.22)  // corner radius
  const pad = Math.round(size * 0.08)
  const inner = size - pad * 2

  // Gradient stops, shadow, main shape
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3d5af1"/>
      <stop offset="100%" stop-color="#2541c4"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="${size*0.04}" stdDeviation="${size*0.06}" flood-color="#1a2a8a" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Drop shadow layer -->
  <rect x="${pad}" y="${pad + size*0.03}" width="${inner}" height="${inner}" rx="${r}" fill="#1a2a8a" opacity="0.25" filter="url(#shadow)"/>

  <!-- Main background -->
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" fill="url(#bg)"/>

  <!-- Inner shine -->
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner * 0.5}" rx="${r}" fill="url(#shine)"/>

  <!-- "M" letter -->
  <text
    x="${size * 0.5}"
    y="${size * 0.56}"
    font-family="-apple-system, 'Segoe UI', Arial, sans-serif"
    font-weight="800"
    font-size="${size * 0.42}"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
    letter-spacing="-${size*0.01}"
    opacity="1"
  >M</text>

  <!-- Down-arrow accent (↓ symbol) — small, bottom-right -->
  <text
    x="${size * 0.73}"
    y="${size * 0.79}"
    font-family="-apple-system, 'Segoe UI', Arial, sans-serif"
    font-weight="700"
    font-size="${size * 0.22}"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
    opacity="0.85"
  >↓</text>

  <!-- Subtle border -->
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" fill="none" stroke="white" stroke-width="${size*0.012}" stroke-opacity="0.15"/>
</svg>`
}

const outDir = path.join(__dirname, 'assets', 'icons')
fs.mkdirSync(outDir, { recursive: true })

// Write SVG files for different sizes
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
sizes.forEach(s => {
  fs.writeFileSync(path.join(outDir, `icon-${s}.svg`), buildSVG(s))
})

// Write the main app SVG
fs.writeFileSync(path.join(outDir, 'icon.svg'), buildSVG(512))

console.log('SVG icons written to', outDir)
console.log('Files:', fs.readdirSync(outDir).join(', '))
