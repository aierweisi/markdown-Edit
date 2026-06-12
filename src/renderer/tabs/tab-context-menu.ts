import type { AppContext } from '../context'
import type { TabManager } from './tab-manager'
import { showToast } from '../ui/toast'

interface ShowOpts {
  x: number
  y: number
  tabId: string
  ctx: AppContext
  tabs: TabManager
  onActivate(id: string): void
  onClose(id: string): void
  onCloseOthers?(id: string): void
  onCloseRight?(id: string): void
  onRename?(id: string): void
}

interface MenuItem {
  label: string
  disabled?: boolean
  separator?: boolean
  run?(): void
}

function buildItems(opts: ShowOpts): MenuItem[] {
  const tab = opts.tabs.getById(opts.tabId)
  if (!tab) return []
  const all = opts.tabs.getAll()
  const idx = all.findIndex((t) => t.id === opts.tabId)

  return [
    { label: '关闭', run: () => opts.onClose(opts.tabId) },
    {
      label: '关闭其他',
      disabled: all.length <= 1,
      run: () => {
        if (opts.onCloseOthers) return opts.onCloseOthers(opts.tabId)
        all.filter((t) => t.id !== opts.tabId).forEach((t) => opts.onClose(t.id))
      },
    },
    {
      label: '关闭右侧',
      disabled: idx >= all.length - 1,
      run: () => {
        if (opts.onCloseRight) return opts.onCloseRight(opts.tabId)
        all.slice(idx + 1).forEach((t) => opts.onClose(t.id))
      },
    },
    { label: '', separator: true },
    {
      label: '重命名',
      run: () => opts.onRename?.(opts.tabId),
    },
    {
      label: '复制路径',
      disabled: !tab.filePath,
      run: () => {
        if (!tab.filePath) return
        void navigator.clipboard
          .writeText(tab.filePath)
          .then(() => showToast('路径已复制', 'success'))
          .catch(() => showToast('复制失败', 'error'))
      },
    },
    {
      label: '在文件夹中显示',
      disabled: !tab.filePath,
      run: async () => {
        if (!tab.filePath) return
        const res = await opts.ctx.api.shellShowItem(tab.filePath)
        if (!res.success) showToast(`打开失败: ${res.error}`, 'error')
      },
    },
  ]
}

export function showTabContextMenu(opts: ShowOpts): void {
  // Remove any previous menu
  document.getElementById('tab-ctx-menu')?.remove()

  const items = buildItems(opts)
  if (items.length === 0) return

  const menu = document.createElement('div')
  menu.id = 'tab-ctx-menu'
  menu.className = 'ctx-menu'

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div')
      sep.className = 'ctx-sep'
      menu.appendChild(sep)
      continue
    }
    const el = document.createElement('div')
    el.className = 'ctx-item' + (item.disabled ? ' disabled' : '')
    el.textContent = item.label
    if (!item.disabled && item.run) {
      el.addEventListener('click', () => {
        item.run!()
        cleanup()
      })
    }
    menu.appendChild(el)
  }

  document.body.appendChild(menu)

  const { innerWidth, innerHeight } = window
  const rect = menu.getBoundingClientRect()
  menu.style.left = Math.min(opts.x, innerWidth - rect.width - 4) + 'px'
  menu.style.top = Math.min(opts.y, innerHeight - rect.height - 4) + 'px'

  let cleanup = (): void => undefined
  const outside = (evt: MouseEvent): void => {
    if (menu.contains(evt.target as Node)) return
    cleanup()
  }
  const onKey = (evt: KeyboardEvent): void => {
    if (evt.key === 'Escape') cleanup()
  }
  cleanup = () => {
    menu.remove()
    document.removeEventListener('mousedown', outside)
    document.removeEventListener('keydown', onKey)
  }
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', onKey)
  })
}
