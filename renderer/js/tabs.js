/**
 * tabs.js — Multi-tab management
 */

const TabManager = (() => {
  let tabs = []
  let activeTabId = null
  let tabCounter = 0

  function genId() { return `tab_${++tabCounter}` }

  function createTab(options = {}) {
    const id = genId()
    const tab = {
      id,
      title: options.title || '未命名',
      filePath: options.filePath || null,
      content: options.content || '',
      modified: false,
      scrollTop: 0,
      cursorPos: { line: 0, ch: 0 }
    }
    tabs.push(tab)
    renderTab(tab)
    return tab
  }

  function renderTab(tab) {
    const container = document.getElementById('tabs-container')
    const el = document.createElement('div')
    el.className = 'tab'
    el.dataset.id = tab.id
    el.draggable = true
    el.innerHTML = `
      <div class="tab-dot"></div>
      <div class="tab-title" title="${tab.title}">${tab.title}</div>
      <button class="tab-close" title="关闭">✕</button>
    `
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) return
      // If already active, start rename; otherwise switch to it
      if (tab.id === activeTabId) {
        startRename(tab.id)
      } else {
        TabManager.setActive(tab.id)
      }
    })
    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation()
      TabManager.closeTab(tab.id)
    })
    // Middle-click to close
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault()
        TabManager.closeTab(tab.id)
      }
    })
    // Right-click context menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      showContextMenu(e, tab.id)
    })
    // Drag reorder
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/tab-id', tab.id)
      el.classList.add('dragging')
    })
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging')
      document.querySelectorAll('.tab.drag-over').forEach(x => x.classList.remove('drag-over'))
    })
    el.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      document.querySelectorAll('.tab.drag-over').forEach(x => x.classList.remove('drag-over'))
      if (tab.id !== dragSrcTabId()) el.classList.add('drag-over')
    })
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
    el.addEventListener('drop', (e) => {
      e.preventDefault()
      el.classList.remove('drag-over')
      const srcId = e.dataTransfer.getData('text/tab-id')
      if (!srcId || srcId === tab.id) return
      reorderTab(srcId, tab.id)
    })
    container.appendChild(el)
  }

  function dragSrcTabId() {
    const dragging = document.querySelector('.tab.dragging')
    return dragging ? dragging.dataset.id : null
  }

  function reorderTab(srcId, targetId) {
    const fromIdx = tabs.findIndex(t => t.id === srcId)
    const toIdx = tabs.findIndex(t => t.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = tabs.splice(fromIdx, 1)
    tabs.splice(toIdx, 0, moved)
    // Re-order DOM
    const container = document.getElementById('tabs-container')
    const srcEl = container.querySelector(`.tab[data-id="${srcId}"]`)
    const tgtEl = container.querySelector(`.tab[data-id="${targetId}"]`)
    if (srcEl && tgtEl) {
      if (fromIdx < toIdx) tgtEl.after(srcEl)
      else tgtEl.before(srcEl)
    }
  }

  function showContextMenu(e, id) {
    // Remove any existing
    const old = document.getElementById('tab-ctx-menu')
    if (old) old.remove()

    const tab = getTab(id)
    if (!tab) return
    const idx = tabs.findIndex(t => t.id === id)

    const menu = document.createElement('div')
    menu.id = 'tab-ctx-menu'
    menu.className = 'ctx-menu'
    const items = [
      { label: '关闭', action: () => closeTab(id) },
      { label: '关闭其他', action: () => closeOthers(id), disabled: tabs.length <= 1 },
      { label: '关闭右侧', action: () => closeRight(id), disabled: idx >= tabs.length - 1 },
      { sep: true },
      { label: '重命名', action: () => startRename(id) },
      { label: '复制路径', action: () => tab.filePath && navigator.clipboard.writeText(tab.filePath), disabled: !tab.filePath },
      { label: '在文件夹中显示', action: () => tab.filePath && window.api.shellShowItem(tab.filePath), disabled: !tab.filePath }
    ]
    items.forEach(it => {
      if (it.sep) {
        const s = document.createElement('div')
        s.className = 'ctx-sep'
        menu.appendChild(s)
        return
      }
      const el = document.createElement('div')
      el.className = 'ctx-item' + (it.disabled ? ' disabled' : '')
      el.textContent = it.label
      if (!it.disabled) {
        el.addEventListener('click', () => { it.action(); menu.remove() })
      }
      menu.appendChild(el)
    })

    document.body.appendChild(menu)
    // Position, clamp to viewport
    const { innerWidth: vw, innerHeight: vh } = window
    const rect = menu.getBoundingClientRect()
    const x = Math.min(e.clientX, vw - rect.width - 4)
    const y = Math.min(e.clientY, vh - rect.height - 4)
    menu.style.left = x + 'px'
    menu.style.top = y + 'px'

    const dismiss = (ev) => {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', dismiss) }
    }
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0)
  }

  async function closeOthers(keepId) {
    const others = tabs.filter(t => t.id !== keepId).map(t => t.id)
    for (const id of others) await closeTab(id)
  }
  async function closeRight(id) {
    const idx = tabs.findIndex(t => t.id === id)
    if (idx < 0) return
    const ids = tabs.slice(idx + 1).map(t => t.id)
    for (const rid of ids) await closeTab(rid)
  }

  function startRename(id) {
    const el = document.querySelector(`.tab[data-id="${id}"]`)
    if (!el) return
    const titleEl = el.querySelector('.tab-title')
    // Already renaming?
    if (el.querySelector('.tab-rename-input')) return

    const tab = getTab(id)
    const input = document.createElement('input')
    input.className = 'tab-rename-input'
    input.value = tab.title
    input.maxLength = 60
    titleEl.replaceWith(input)
    input.focus()
    input.select()

    let committed = false
    function commit() {
      if (committed) return
      committed = true
      const newTitle = input.value.trim() || tab.title
      // Restore title element first
      input.replaceWith(titleEl)
      // Then update title
      TabManager.setTabTitle(id, newTitle)
    }

    input.addEventListener('blur', commit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur() }
      if (e.key === 'Escape') {
        committed = true
        input.replaceWith(titleEl)
      }
      e.stopPropagation()
    })
  }

  function updateTabEl(tab) {
    const el = document.querySelector(`.tab[data-id="${tab.id}"]`)
    if (!el) return
    // Skip title update if a rename input is currently active
    const titleEl = el.querySelector('.tab-title')
    if (titleEl) {
      titleEl.textContent = tab.title
      titleEl.title = tab.title
    }
    el.classList.toggle('modified', tab.modified)
  }

  function setActive(id) {
    // Save current editor state to current tab
    if (activeTabId) {
      const current = getTab(activeTabId)
      if (current) {
        current.content = EditorManager.getValue()
        current.scrollTop = EditorManager.getScrollTop()
        current.cursorPos = EditorManager.getCursor()
      }
    }

    activeTabId = id
    tabs.forEach(t => {
      const el = document.querySelector(`.tab[data-id="${t.id}"]`)
      if (el) el.classList.toggle('active', t.id === id)
    })

    const tab = getTab(id)
    if (tab) {
      EditorManager.setValue(tab.content)
      EditorManager.setCursor(tab.cursorPos)
      EditorManager.setScrollTop(tab.scrollTop)
      updateStatusFile(tab)
    }
  }

  function updateStatusFile(tab) {
    const statusFile = document.getElementById('status-file')
    if (statusFile) {
      statusFile.textContent = tab.filePath
        ? tab.filePath.split(/[/\\]/).pop()
        : tab.title
    }
    const statusModified = document.getElementById('status-modified')
    if (statusModified) {
      statusModified.textContent = tab.modified ? '● 未保存' : ''
    }
  }

  async function closeTab(id) {
    const tab = getTab(id)
    if (!tab) return

    if (tab.modified) {
      // Simple confirm via native dialog would require IPC, use simple check
      if (!confirm(`"${tab.title}" 有未保存的更改，确定要关闭吗？`)) return
    }

    const idx = tabs.findIndex(t => t.id === id)
    tabs.splice(idx, 1)

    const el = document.querySelector(`.tab[data-id="${id}"]`)
    if (el) el.remove()

    // Remove from cache
    CacheManager.removeTab(id)

    if (tabs.length === 0) {
      // Open new empty tab
      const newTab = createTab()
      setActive(newTab.id)
    } else {
      const nextTab = tabs[Math.min(idx, tabs.length - 1)]
      setActive(nextTab.id)
    }
  }

  function getActive() {
    return getTab(activeTabId)
  }

  function getTab(id) {
    return tabs.find(t => t.id === id)
  }

  function getAllTabs() { return tabs }

  function markModified(id, modified) {
    const tab = getTab(id)
    if (!tab) return
    tab.modified = modified
    updateTabEl(tab)
    updateStatusFile(tab)
  }

  function setTabTitle(id, title, filePath) {
    const tab = getTab(id)
    if (!tab) return
    tab.title = title
    if (filePath !== undefined) tab.filePath = filePath
    updateTabEl(tab)
    updateStatusFile(tab)
  }

  function restoreFromCache(cachedTabs) {
    cachedTabs.forEach(ct => {
      const tab = createTab({ title: ct.title, filePath: ct.filePath, content: ct.content })
      tab.id = ct.id  // restore original id
      tab.scrollTop = ct.scrollTop || 0
      tab.cursorPos = ct.cursorPos || { line: 0, ch: 0 }
      // Fix dom element id
      const el = document.querySelector('.tab:last-child')
      if (el) el.dataset.id = ct.id
    })
    // Remove the auto-generated tabs
  }

  return {
    createTab, setActive, closeTab,
    getActive, getTab, getAllTabs,
    markModified, setTabTitle, restoreFromCache,
    get activeTabId() { return activeTabId }
  }
})()
