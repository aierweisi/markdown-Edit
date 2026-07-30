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
    group: '查找',
    items: [
      { key: 'Ctrl+F', label: '查找' },
      { key: 'Ctrl+H', label: '替换' },
      { key: 'F3', label: '查找下一个' },
      { key: 'Shift+F3', label: '查找上一个' },
    ],
  },
  {
    group: '格式（编辑器内）',
    items: [
      { key: 'Ctrl+B', label: '粗体' },
      { key: 'Ctrl+I', label: '斜体' },
      { key: 'Ctrl+K', label: '链接' },
      { key: 'Ctrl+Shift+I', label: '图片' },
      { key: 'Ctrl+`', label: '行内代码' },
      { key: 'Ctrl+Shift+C', label: '代码块' },
      { key: 'Ctrl+Shift+X', label: '删除线' },
      { key: 'Ctrl+Shift+.', label: '引用' },
      { key: 'Ctrl+Shift+7', label: '有序列表' },
      { key: 'Ctrl+Shift+8', label: '无序列表' },
      { key: 'Ctrl+Alt+T', label: '插入表格' },
      { key: 'Ctrl+Alt+H', label: '循环标题级别' },
      { key: 'Ctrl+Alt+R', label: '分割线' },
      { key: 'Ctrl+Alt+O', label: '插入目录' },
    ],
  },
  {
    group: '视图',
    items: [
      { key: 'Ctrl+\\', label: '切换视图模式' },
      { key: 'Ctrl+Shift+F', label: '专注模式' },
      { key: 'Ctrl+Shift+E', label: '收起/展开工作区' },
      { key: 'Ctrl+Shift+L', label: '切换主题' },
      { key: 'Ctrl+Shift+O', label: '文章大纲' },
      { key: 'Ctrl+Shift+/', label: '快捷键展示' },
    ],
  },
  {
    group: '标签',
    items: [
      { key: 'Ctrl+T', label: '新建标签页' },
      { key: 'Ctrl+W', label: '关闭当前标签' },
      { key: 'Ctrl+Shift+T', label: '重开已关闭标签' },
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
    <section class="shortcuts-section">
      <h3 class="shortcuts-group-title">${g.group}</h3>
      <div class="shortcuts-table">
        ${g.items
          .map(
            (i) => `
          <div class="shortcuts-row">
            <kbd class="shortcuts-key">${i.key}</kbd>
            <span class="shortcuts-label">${i.label}</span>
          </div>`,
          )
          .join('')}
      </div>
    </section>`,
  ).join('')
}
