/**
 * ShortcutManager — 快捷键数据管理与展示
 * 集中管理所有快捷键定义，并为设置面板提供渲染支持
 */
window.ShortcutManager = (() => {
  // ── 快捷键定义 ──────────────────────────────────────────
  // group: 分组名（中文），items: [{ key: 按键, label: 描述 }]
  const shortcuts = [
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
        { key: 'Ctrl+D', label: '删除行' },
      ],
    },
    {
      group: '插入',
      items: [
        { key: 'Ctrl+B', label: '粗体' },
        { key: 'Ctrl+I', label: '斜体' },
        { key: 'Ctrl+K', label: '链接' },
        { key: 'Ctrl+Shift+I', label: '图片' },
      ],
    },
    {
      group: '视图',
      items: [
        { key: 'Ctrl+\\', label: '循环视图模式' },
        { key: 'Ctrl+Shift+\\', label: '互换编辑/预览位置' },
        { key: 'Ctrl+Shift+T', label: '切换主题' },
        { key: 'Ctrl+Shift+/', label: '快捷键展示' },
      ],
    },
    {
      group: '标签',
      items: [
        { key: 'Ctrl+T', label: '新建标签页' },
        { key: 'Ctrl+W', label: '关闭当前标签' },
      ],
    },
    {
      group: '工具',
      items: [
        { key: 'Ctrl+P', label: '命令面板' },
        { key: 'Ctrl+,', label: '打开设置' },
        { key: 'F11', label: '切换全屏' },
      ],
    },
    {
      group: '查找面板',
      items: [
        { key: 'Enter / F3', label: '查找下一个' },
        { key: 'Shift+Enter / Shift+F3', label: '查找上一个' },
        { key: 'Esc', label: '关闭查找面板' },
      ],
    },
  ]

  /**
   * 获取所有快捷键分组数据（深拷贝副本）
   */
  function getAll() {
    return shortcuts.map(g => ({
      group: g.group,
      items: g.items.map(i => ({ ...i })),
    }))
  }

  /**
   * 获取指定分组名的快捷键列表
   */
  function getGroup(groupName) {
    const g = shortcuts.find(s => s.group === groupName)
    return g ? g.items.map(i => ({ ...i })) : []
  }

  /**
   * 获取快捷键总条数
   */
  function count() {
    return shortcuts.reduce((acc, g) => acc + g.items.length, 0)
  }

  /**
   * 在设置面板中渲染快捷键展示内容
   * @param {HTMLElement} container - 面板容器元素
   */
  function renderPanel(container) {
    if (!container) return
    container.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.className = 'shortcuts-panel-wrap'

    shortcuts.forEach((group, gi) => {
      const section = document.createElement('div')
      section.className = 'shortcuts-section'

      const title = document.createElement('div')
      title.className = 'shortcuts-group-title'
      title.textContent = group.group
      section.appendChild(title)

      const table = document.createElement('div')
      table.className = 'shortcuts-table'

      group.items.forEach(item => {
        const row = document.createElement('div')
        row.className = 'shortcuts-row'

        const keyEl = document.createElement('kbd')
        keyEl.className = 'shortcuts-key'
        keyEl.textContent = item.key

        const labelEl = document.createElement('span')
        labelEl.className = 'shortcuts-label'
        labelEl.textContent = item.label

        row.appendChild(keyEl)
        row.appendChild(labelEl)
        table.appendChild(row)
      })

      section.appendChild(table)
      wrap.appendChild(section)
    })

    container.appendChild(wrap)
  }

  return {
    getAll,
    getGroup,
    count,
    renderPanel,
  }
})()
