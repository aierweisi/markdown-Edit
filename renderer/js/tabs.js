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
    container.appendChild(el)
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
    el.querySelector('.tab-title').textContent = tab.title
    el.querySelector('.tab-title').title = tab.title
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
