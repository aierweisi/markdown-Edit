/**
 * generate-icon.js
 * 生成应用图标 SVG (多尺寸), 风格与应用内 .app-logo-icon 一致:
 * - 四色对角渐变: cyan(#06b6d4) -> indigo(#6366f1) -> violet(#8b5cf6) -> pink(#ec4899)
 * - 圆角方形 + 顶部高光 + 柔和阴影
 * - "M" 主字 + 右下小 "↓"
 * Run: node generate-icon.js
 */

const fs = require('fs')
const path = require('path')

function buildSVG(size) {
  const r = Math.round(size * 0.24)       // corner radius — 比之前略圆, 接近 app 内 logo (7/22≈0.32) 与 macOS/Win 习惯之间
  const pad = Math.round(size * 0.08)
  const inner = size - pad * 2

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 四色渐变, 135deg 等价 (x1=0%,y1=0%) -> (x2=100%,y2=100%) -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#06b6d4"/>
      <stop offset="35%"  stop-color="#6366f1"/>
      <stop offset="70%"  stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <!-- 顶部柔和高光 -->
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.30"/>
      <stop offset="60%"  stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <!-- 投影 (用 indigo 染色, 而不是中性灰, 跟主色调一致) -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="${size * 0.04}" stdDeviation="${size * 0.06}" flood-color="#4338ca" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- 投影层 -->
  <rect x="${pad}" y="${pad + size * 0.03}" width="${inner}" height="${inner}" rx="${r}"
        fill="#4338ca" opacity="0.25" filter="url(#shadow)"/>

  <!-- 主背景 (四色渐变) -->
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" fill="url(#bg)"/>

  <!-- 顶部内高光 -->
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner * 0.5}" rx="${r}" fill="url(#shine)"/>

  <!-- 主字 "M" -->
  <text
    x="${size * 0.5}"
    y="${size * 0.56}"
    font-family="-apple-system, 'Segoe UI', 'PingFang SC', Arial, sans-serif"
    font-weight="800"
    font-size="${size * 0.42}"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
    letter-spacing="-${size * 0.01}"
  >M</text>

  <!-- 右下小箭头 "↓" -->
  <text
    x="${size * 0.73}"
    y="${size * 0.79}"
    font-family="-apple-system, 'Segoe UI', 'PingFang SC', Arial, sans-serif"
    font-weight="700"
    font-size="${size * 0.22}"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
    opacity="0.92"
  >↓</text>

  <!-- 内部 1px 白色描边, 提高边缘锐度 -->
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}"
        fill="none" stroke="white" stroke-width="${size * 0.012}" stroke-opacity="0.18"/>
</svg>`
}

const outDir = path.join(__dirname, 'assets', 'icons')
fs.mkdirSync(outDir, { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
sizes.forEach(s => {
  fs.writeFileSync(path.join(outDir, `icon-${s}.svg`), buildSVG(s))
})

fs.writeFileSync(path.join(outDir, 'icon.svg'), buildSVG(512))

console.log('SVG icons written to', outDir)
console.log('Files:', fs.readdirSync(outDir).join(', '))
