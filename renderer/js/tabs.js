/**
 * tabs.js — Multi-tab management
 */

const TabManager = (() => {
  let tabs = []
  let activeTabId = null
  let tabCounter = 0
  let switchCallback = null

  function genId() { return `tab_${++tabCounter}` }
  function onSwitch(cb) { switchCallback = cb }
  let closeCallback = null
  function onClose(cb) { closeCallback = cb }

  // 应用风格的确认框,返回 Promise<boolean>
  // 替代原生 confirm() 的视觉割裂感
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
  }
  function showConfirm(message, opts = {}) {
    return new Promise(resolve => {
      const title = opts.title || '确认'
      const okText = opts.okText || '确定'
      const cancelText = opts.cancelText || '取消'
      const danger = !!opts.danger

      const overlay = document.createElement('div')
      overlay.className = 'modal-overlay confirm-overlay'
      overlay.innerHTML = `
        <div class="modal modal-small">
          <div class="modal-header"><h2>${escHtml(title)}</h2></div>
          <div class="modal-body">
            <p class="confirm-message">${escHtml(message)}</p>
            <div class="modal-actions">
              <button class="btn-secondary confirm-cancel">${escHtml(cancelText)}</button>
              <button class="${danger ? 'btn-danger' : 'btn-primary'} confirm-ok">${escHtml(okText)}</button>
            </div>
          </div>
        </div>
      `
      document.body.appendChild(overlay)
      // 触发 transition / animation
      requestAnimationFrame(() => overlay.classList.add('open'))

      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false) }
        else if (e.key === 'Enter') { e.preventDefault(); finish(true) }
      }
      const finish = (val) => {
        overlay.classList.remove('open')
        overlay.classList.add('closing')
        document.removeEventListener('keydown', onKey, true)
        setTimeout(() => overlay.remove(), 220)
        resolve(val)
      }
      overlay.querySelector('.confirm-ok').addEventListener('click', () => finish(true))
      overlay.querySelector('.confirm-cancel').addEventListener('click', () => finish(false))
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false) })
      document.addEventListener('keydown', onKey, true)
      setTimeout(() => {
        const ok = overlay.querySelector('.confirm-ok')
        if (ok) ok.focus()
      }, 60)
    })
  }
  // 暴露到全局, 让其它模块也能调用应用风格的确认框
  window.showConfirm = showConfirm

  function createTab(options = {}) {
    const id = genId()
    const content = options.content || ''
    const tab = {
      id,
      title: options.title || '未命名',
      filePath: options.filePath || null,
      // content 仅用于缓存序列化的兜底；运行时真实内容由 doc 持有
      content,
      modified: false,
      scrollTop: 0,
      // 每个 tab 拥有独立 CodeMirror Doc,包含自己的撤销栈和光标
      doc: window.EditorManager ? EditorManager.createDoc(content) : null
    }
    tabs.push(tab)
    renderTab(tab)
    return tab
  }

  function renderTab(tab) {
    const container = document.getElementById('tabs-container')
    if (container && !container.dataset.wheelBound) {
      container.dataset.wheelBound = '1'
      container.addEventListener('wheel', (e) => {
        if (e.deltaY === 0) return
        container.scrollLeft += e.deltaY
        e.preventDefault()
      }, { passive: false })
    }
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
    // 双击标签名快速进入重命名模式（无论激活状态）
    el.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('tab-close')) return
      e.preventDefault()
      e.stopPropagation()
      if (tab.id !== activeTabId) TabManager.setActive(tab.id)
      startRename(tab.id)
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
    async function commit() {
      if (committed) return
      committed = true
      const newTitle = input.value.trim() || tab.title
      // Restore title element first
      input.replaceWith(titleEl)

      if (newTitle === tab.title) {
        TabManager.setTabTitle(id, newTitle)
        return
      }

      // 已保存的文件：同步重命名磁盘文件，保持扩展名不变
      if (tab.filePath && window.api && window.api.fileRename) {
        const oldPath = tab.filePath
        const sep = oldPath.includes('\\') ? '\\' : '/'
        const lastSep = Math.max(oldPath.lastIndexOf('\\'), oldPath.lastIndexOf('/'))
        const dir = lastSep >= 0 ? oldPath.slice(0, lastSep) : ''
        const oldBase = lastSep >= 0 ? oldPath.slice(lastSep + 1) : oldPath
        const extMatch = oldBase.match(/\.(md|markdown|txt)$/i)
        const ext = extMatch ? extMatch[0] : '.md'
        // 清理新名中的非法文件名字符
        const safeTitle = newTitle.replace(/[\\/:*?"<>|]/g, '_').trim() || tab.title
        const newPath = (dir ? dir + sep : '') + safeTitle + ext
        const res = await window.api.fileRename(oldPath, newPath)
        if (res && res.success) {
          TabManager.setTabTitle(id, safeTitle, res.newPath || newPath)
        } else {
          alert('重命名失败：' + (res && res.error ? res.error : '未知错误'))
          // 回滚标题（保持磁盘真实情况）
          TabManager.setTabTitle(id, tab.title)
        }
      } else {
        // 未保存的草稿：仅更新标题，下次保存时以此为默认文件名
        TabManager.setTabTitle(id, newTitle)
      }
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
    // 保存当前 tab 的滚动位置（光标和内容由 Doc 自己持有,不需要额外存）
    if (activeTabId) {
      const current = getTab(activeTabId)
      if (current) {
        current.scrollTop = EditorManager.getScrollTop()
      }
    }

    activeTabId = id
    tabs.forEach(t => {
      const el = document.querySelector(`.tab[data-id="${t.id}"]`)
      if (el) el.classList.toggle('active', t.id === id)
    })

    const tab = getTab(id)
    if (tab) {
      // swapDoc 不触发 change 事件,也不清空撤销栈
      if (tab.doc) {
        EditorManager.swapDoc(tab.doc)
      } else {
        // 兜底：旧缓存还原的 tab 可能没有 doc,补建一个
        tab.doc = EditorManager.createDoc(tab.content || '')
        EditorManager.swapDoc(tab.doc)
      }
      EditorManager.setScrollTop(tab.scrollTop || 0)
      updateStatusFile(tab)
      // 因为 swapDoc 不触发 change,这里通知外部刷新预览/字数/状态栏
      if (switchCallback) {
        try { switchCallback(tab) } catch (e) { console.error('tab switch cb failed:', e) }
      }
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
      const ok = await showConfirm(`"${tab.title}" 有未保存的更改,确定要关闭吗?`, {
        title: '关闭未保存文档',
        okText: '关闭',
        cancelText: '取消',
        danger: true
      })
      if (!ok) return
    }

    const idx = tabs.findIndex(t => t.id === id)
    const wasActive = id === activeTabId
    tabs.splice(idx, 1)

    const el = document.querySelector(`.tab[data-id="${id}"]`)
    if (el) el.remove()

    // Remove from cache
    CacheManager.removeTab(id)
    syncUnsavedClass()

    if (tabs.length === 0) {
      // Open new empty tab
      activeTabId = null
      const newTab = createTab()
      setActive(newTab.id)
      if (closeCallback) closeCallback()
    } else if (wasActive) {
      const nextTab = tabs[Math.min(idx, tabs.length - 1)]
      activeTabId = null  // prevent saving editor state into the closed tab
      setActive(nextTab.id)
      if (closeCallback) closeCallback()
    } else {
      if (closeCallback) closeCallback()
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
    syncUnsavedClass()
  }
  // 任意一个 tab 处于 modified 时, 给 body 加 has-unsaved 类
  // 配合 CSS 上的"保存按钮脉冲提示"
  function syncUnsavedClass() {
    const any = tabs.some(t => t.modified)
    document.body.classList.toggle('has-unsaved', any)
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
    onSwitch, onClose, syncUnsavedClass,
    get activeTabId() { return activeTabId }
  }
})()
