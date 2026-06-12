export interface ShortcutGroup {
  group: string
  items: Array<{ key: string; label: string }>
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    group: '文件',
    items: [
      { key: 'Ctrl+N', label: '新建' },
      { key: 'Ctrl+O', label: '打开文件' },
      { key: 'Ctrl+S', label: '保存' },
      { key: 'Ctrl+Shift+S', label: '另存为' },
      { key: 'Ctrl+Shift+R', label: '最近文件' },
    ],
  },
  {
    group: '编辑',
    items: [
      { key: 'Ctrl+F', label: '查找' },
      { key: 'Ctrl+H', label: '替换' },
      { key: 'Ctrl+B', label: '粗体' },
      { key: 'Ctrl+I', label: '斜体' },
      { key: 'Ctrl+K', label: '链接' },
    ],
  },
  {
    group: '视图',
    items: [
      { key: 'Ctrl+\\', label: '切换视图模式' },
      { key: 'Ctrl+Shift+T', label: '切换主题' },
      { key: 'Ctrl+Shift+/', label: '快捷键展示' },
    ],
  },
  {
    group: '标签',
    items: [
      { key: 'Ctrl+T', label: '新建标签页' },
      { key: 'Ctrl+W', label: '关闭当前标签' },
      { key: 'Ctrl+Tab', label: '下一个标签' },
      { key: 'Ctrl+1..9', label: '跳转到第 N 个标签' },
    ],
  },
  {
    group: '工具',
    items: [
      { key: 'Ctrl+Shift+P', label: '命令面板' },
      { key: 'Ctrl+,', label: '打开设置' },
      { key: 'F11', label: '切换全屏' },
    ],
  },
]

export function renderShortcutsHTML(): string {
  return SHORTCUTS.map(
    (g) => `
    <section class="shortcuts__section">
      <h3 class="shortcuts__group">${g.group}</h3>
      <div class="shortcuts__table">
        ${g.items
          .map(
            (i) => `
          <div class="shortcuts__row">
            <kbd class="shortcuts__key">${i.key}</kbd>
            <span class="shortcuts__label">${i.label}</span>
          </div>`,
          )
          .join('')}
      </div>
    </section>`,
  ).join('')
}
