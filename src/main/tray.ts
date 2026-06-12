import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface TrayOpts {
  getWindow(): BrowserWindow | null
  onQuit(): void
}

let tray: Tray | null = null

export function createTray(opts: TrayOpts): Tray {
  if (tray) return tray

  const isWin = process.platform === 'win32'
  const iconName = isWin ? 'icon.ico' : 'icon.png'
  const iconPath = join(__dirname, '../../assets/icons/', iconName)
  const image = existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  if (!isWin) image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip('Markdown Editor')

  const showWindow = (): void => {
    const win = opts.getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  const menu = Menu.buildFromTemplate([
    { label: '显示 Markdown Editor', click: showWindow },
    { type: 'separator' },
    { label: '退出', click: () => { opts.onQuit(); app.quit() } },
  ])

  tray.setContextMenu(menu)
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)

  return tray
}
