window.TabManager = (() => {
  const tabs = []
  let activeId = null,
    idCounter = 0,
    onSwitchCb = null,
    onCloseCb = null

  function esc(text) {
    return escHtml(text)
  }

  function showConfirm(msg, opts = {}) {
    return new Promise(resolve => {
      const title = opts.title || '确认',
        okText = opts.okText || '确定',
        cancelText = opts.cancelText || '取消',
        isDanger = !!opts.danger,
        overlay = document.createElement('div')
      overlay.className = 'modal-overlay confirm-overlay'
      overlay.innerHTML = `\n        <div class="modal modal-small">\n          <div class="modal-header"><h2>${esc(title)}</h2></div>\n          <div class="modal-body">\n            <p class="confirm-message">${esc(msg)}</p>\n            <div class="modal-actions">\n              <button class="btn-secondary confirm-cancel">${esc(cancelText)}</button>\n              <button class="${isDanger ? 'btn-danger' : 'btn-primary'} confirm-ok">${esc(okText)}</button>\n            </div>\n          </div>\n        </div>\n      `
      document.body.appendChild(overlay)
      let closed = false
      requestAnimationFrame(() => overlay.classList.add('open'))

      const onKeydown = evt => {
          if (closed) return
          'Escape' === evt.key ? (evt.preventDefault(), close(!1)) : 'Enter' === evt.key && (evt.preventDefault(), close(!0))
        },
        close = result => {
          if (closed) return
          closed = true
          overlay.classList.remove('open')
          overlay.classList.add('closing')
          document.removeEventListener('keydown', onKeydown, !0)
          setTimeout(() => { overlay.parentNode && overlay.remove() }, 220)
          resolve(result)
        }
      overlay.querySelector('.confirm-ok').addEventListener('click', () => close(!0))
      overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(!1))
      overlay.addEventListener('click', evt => {
        evt.target === overlay && close(!1)
      })
      document.addEventListener('keydown', onKeydown, !0)
      setTimeout(() => {
        const okBtn = overlay.querySelector('.confirm-ok')
        okBtn && okBtn.focus()
      }, 60)
    })
  }

  function createTab(data = {}) {
    const id = 'tab_' + ++idCounter,
      content = data.content || '',
      tab = {
        id: id,
        title: data.title || '未命名',
        filePath: data.filePath || null,
        content: content,
        modified: !1,
        scrollTop: 0,
        doc: window.EditorManager ? EditorManager.createDoc(content) : null,
      }
    tabs.push(tab)
    renderTabElement(tab)
    return tab
  }

  function renderTabElement(tab) {
    const container = document.getElementById('tabs-container')
    container &&
      !container.dataset.wheelBound &&
      ((container.dataset.wheelBound = '1'),
        container.addEventListener('wheel', evt => {
          0 !== evt.deltaY && ((container.scrollLeft += evt.deltaY), evt.preventDefault())
        }, { passive: !1 }))

    const el = document.createElement('div')
    el.className = 'tab'
    el.dataset.id = tab.id
    el.draggable = !0
    el.innerHTML = `\n      <div class="tab-dot"></div>\n      <div class="tab-title" title="${tab.title}">${tab.title}</div>\n      <button class="tab-close" title="关闭">✕</button>\n    `

    el.addEventListener('click', evt => {
      evt.target.classList.contains('tab-close') ||
        (tab.id === activeId ? startRename(tab.id) : TabManager.setActive(tab.id))
    })
    el.addEventListener('dblclick', evt => {
      evt.target.classList.contains('tab-close') ||
        (evt.preventDefault(),
          evt.stopPropagation(),
          tab.id !== activeId && TabManager.setActive(tab.id),
          startRename(tab.id))
    })
    el.querySelector('.tab-close').addEventListener('click', evt => {
      evt.stopPropagation()
      TabManager.closeTab(tab.id)
    })
    el.addEventListener('mousedown', evt => {
      1 === evt.button && (evt.preventDefault(), TabManager.closeTab(tab.id))
    })
    el.addEventListener('contextmenu', evt => {
      evt.preventDefault()
      showContextMenu(evt, tab.id)
    })
    el.addEventListener('dragstart', evt => {
      evt.dataTransfer.effectAllowed = 'move'
      evt.dataTransfer.setData('text/tab-id', tab.id)
      el.classList.add('dragging')
    })
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging')
      document.querySelectorAll('.tab.drag-over').forEach(e => e.classList.remove('drag-over'))
    })
    el.addEventListener('dragover', evt => {
      evt.preventDefault()
      evt.dataTransfer.dropEffect = 'move'
      document.querySelectorAll('.tab.drag-over').forEach(e => e.classList.remove('drag-over'))
      const dragging = document.querySelector('.tab.dragging')
      tab.id !== (dragging ? dragging.dataset.id : null) && el.classList.add('drag-over')
    })
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
    el.addEventListener('drop', evt => {
      evt.preventDefault()
      el.classList.remove('drag-over')
      const draggedId = evt.dataTransfer.getData('text/tab-id')
      draggedId && draggedId !== tab.id && reorderTabs(draggedId, tab.id)
    })
    container.appendChild(el)
  }

  function showContextMenu(evt, tabId) {
    const old = document.getElementById('tab-ctx-menu')
    old && old.remove()

    const tab = getTab(tabId)
    if (!tab) return

    const idx = tabs.findIndex(t => t.id === tabId),
      menu = document.createElement('div')
    menu.id = 'tab-ctx-menu'
    menu.className = 'ctx-menu'

    const items = [
      { label: '关闭', action: () => closeTab(tabId) },
      { label: '关闭其他', action: () => { const ids = tabs.filter(t => t.id !== tabId).map(t => t.id); ids.forEach(id => closeTab(id)) }, disabled: tabs.length <= 1 },
      { label: '关闭右侧', action: () => { const right = tabs.slice(idx + 1).map(t => t.id); right.forEach(id => closeTab(id)) }, disabled: idx >= tabs.length - 1 },
      { sep: !0 },
      { label: '重命名', action: () => startRename(tabId) },
      { label: '复制路径', action: () => tab.filePath && navigator.clipboard.writeText(tab.filePath), disabled: !tab.filePath },
      { label: '在文件夹中显示', action: () => tab.filePath && window.api.shellShowItem(tab.filePath), disabled: !tab.filePath },
    ]

    items.forEach(item => {
      if (item.sep) {
        const sep = document.createElement('div')
        sep.className = 'ctx-sep'
        menu.appendChild(sep)
        return
      }
      const el = document.createElement('div')
      el.className = 'ctx-item' + (item.disabled ? ' disabled' : '')
      el.textContent = item.label
      item.disabled || el.addEventListener('click', () => { item.action(); menu.remove() })
      menu.appendChild(el)
    })

    document.body.appendChild(menu)
    const { innerWidth: winW, innerHeight: winH } = window,
      rect = menu.getBoundingClientRect(),
      left = Math.min(evt.clientX, winW - rect.width - 4),
      top = Math.min(evt.clientY, winH - rect.height - 4)
    menu.style.left = left + 'px'
    menu.style.top = top + 'px'

    document.removeEventListener('mousedown', menu._cb)
    menu._cb = function clickOutside(e) {
      menu.contains(e.target) || (menu.remove(), document.removeEventListener('mousedown', clickOutside))
      delete menu._cb
    }
    requestAnimationFrame(() => document.addEventListener('mousedown', menu._cb))
  }

  function startRename(tabId) {
    const tabEl = document.querySelector(`.tab[data-id="${tabId}"]`)
    if (!tabEl) return
    const titleEl = tabEl.querySelector('.tab-title')
    if (tabEl.querySelector('.tab-rename-input')) return

    const tab = getTab(tabId),
      input = document.createElement('input')
    input.className = 'tab-rename-input'
    input.value = tab.title
    input.maxLength = 60
    titleEl.replaceWith(input)
    input.focus()
    input.select()

    let closed = !1
    input.addEventListener('blur', async function () {
      if (closed) return
      closed = !0
      const newTitle = input.value.trim() || tab.title
      input.replaceWith(titleEl)
      if (newTitle !== tab.title) {
        if (tab.filePath && window.api && window.api.fileRename) {
          const oldPath = tab.filePath,
            sep = oldPath.includes('\\') ? '\\' : '/',
            lastSep = Math.max(oldPath.lastIndexOf('\\'), oldPath.lastIndexOf('/')),
            dir = lastSep >= 0 ? oldPath.slice(0, lastSep) : '',
            extMatch = (lastSep >= 0 ? oldPath.slice(lastSep + 1) : oldPath).match(/\.(md|markdown|mdown|mkdn|mkd|mdwn|txt)$/i),
            ext = extMatch ? extMatch[0] : '.md',
            safeName = newTitle.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '').trim() || tab.title,
            newPath = (dir ? dir + sep : '') + safeName + ext,
            result = await window.api.fileRename(oldPath, newPath)
          result && result.success
            ? (TabManager.setTabTitle(tabId, safeName, result.newPath || newPath),
              // 同步 tab.content，确保缓存/恢复时使用重命名后的编辑器内容
              tab.content = tab.doc ? tab.doc.getValue() : (tab.content || ''))
            : (ExportManager.showToast('重命名失败：' + (result && result.error ? result.error : '未知错误'), 'error'),
              TabManager.setTabTitle(tabId, tab.title))
        } else TabManager.setTabTitle(tabId, newTitle)
      } else TabManager.setTabTitle(tabId, newTitle)
    })

    input.addEventListener('keydown', evt => {
      'Enter' === evt.key && (evt.preventDefault(), input.blur())
      'Escape' === evt.key && ((closed = !0), input.replaceWith(titleEl))
      evt.stopPropagation()
    })
  }

  function syncTabUi(tab) {
    const el = document.querySelector(`.tab[data-id="${tab.id}"]`)
    if (!el) return
    const titleEl = el.querySelector('.tab-title')
    titleEl && ((titleEl.textContent = tab.title), (titleEl.title = tab.title))
    el.classList.toggle('modified', tab.modified)
  }

  function setActive(id) {
    if (activeId) {
      const prev = getTab(activeId)
      prev && (prev.scrollTop = EditorManager.getScrollTop())
    }
    activeId = id
    tabs.forEach(t => {
      const el = document.querySelector(`.tab[data-id="${t.id}"]`)
      el && el.classList.toggle('active', t.id === id)
    })
    const tab = getTab(id)
    if (tab) {
      tab.doc || (tab.doc = EditorManager.createDoc(tab.content || ''))
      EditorManager.swapDoc(tab.doc)
      EditorManager.setScrollTop(tab.scrollTop || 0)
      updateStatusBar(tab)
      if (onSwitchCb)
        try {
          onSwitchCb(tab)
        } catch (err) {
          console.error('tab switch cb failed:', err)
        }
    }
    CacheManager.markDirty()
  }

  function updateStatusBar(tab) {
    const fileEl = document.getElementById('status-file')
    fileEl && (fileEl.textContent = tab.filePath ? tab.filePath.split(/[/\\]/).pop() : tab.title)
    const modEl = document.getElementById('status-modified')
    modEl && (modEl.textContent = tab.modified ? '● 未保存' : '')
  }

  async function closeTab(tabId) {
    const tab = getTab(tabId)
    if (!tab) return
    if (
      tab.modified &&
      !(await showConfirm(`"${tab.title}" 有未保存的更改,确定要关闭吗?`, {
        title: '关闭未保存文档',
        okText: '关闭',
        cancelText: '取消',
        danger: !0,
      }))
    )
      return

    const idx = tabs.findIndex(t => t.id === tabId),
      isActive = tabId === activeId
    tabs.splice(idx, 1)

    // 关闭标签时清理查找高亮标记
    if (isActive && window.FindManager) {
      window.FindManager.clearMarkers && window.FindManager.clearMarkers()
      window.FindManager.isVisible && window.FindManager.isVisible() && window.FindManager.hide()
    }

    const el = document.querySelector(`.tab[data-id="${tabId}"]`)
    el && el.remove()
    CacheManager.removeTab(tabId)
    syncUnsavedClass()

    if (0 === tabs.length) {
      activeId = null
      window.__allTabsClosed = true
      onCloseCb && onCloseCb()
    } else if (isActive) {
      const next = tabs[Math.min(idx, tabs.length - 1)]
      activeId = null
      setActive(next.id)
      onCloseCb && onCloseCb()
    } else onCloseCb && onCloseCb()
    CacheManager.markDirty()
  }

  function getTab(id) {
    return tabs.find(t => t.id === id)
  }

  function syncUnsavedClass() {
    const hasUnsaved = tabs.some(t => t.modified)
    document.body.classList.toggle('has-unsaved', hasUnsaved)
  }

  function reorderTabs(draggedId, targetId) {
    const fromIdx = tabs.findIndex(t => t.id === draggedId),
      toIdx = tabs.findIndex(t => t.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = tabs.splice(fromIdx, 1)
    tabs.splice(toIdx, 0, moved)
    const container = document.getElementById('tabs-container'),
      draggedEl = container.querySelector(`.tab[data-id="${draggedId}"]`),
      targetEl = container.querySelector(`.tab[data-id="${targetId}"]`)
    draggedEl && targetEl && (fromIdx < toIdx ? targetEl.after(draggedEl) : targetEl.before(draggedEl))
    CacheManager.markDirty()
    saveOrder()
  }

  function getTabOrder() {
    return tabs.map(t => t.id)
  }

  function saveOrder() {
    const ids = getTabOrder()
    window.api && window.api.storeSet && window.api.storeSet('tabOrder', ids)
  }

  function loadOrder() {
    if (!window.api || !window.api.storeGet) return
    window.api.storeGet('tabOrder').then(savedIds => {
      if (!savedIds || !Array.isArray(savedIds) || savedIds.length === 0) return
      const idSet = new Set(tabs.map(t => t.id))
      const validIds = savedIds.filter(id => idSet.has(id))
      if (validIds.length === 0) return
      tabs.sort((a, b) => {
        const ia = validIds.indexOf(a.id),
          ib = validIds.indexOf(b.id)
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
      })
      const container = document.getElementById('tabs-container')
      if (!container) return
      tabs.forEach(t => {
        const el = container.querySelector(`.tab[data-id="${t.id}"]`)
        el && container.appendChild(el)
      })
    })
  }

  return (
    (window.showConfirm = showConfirm),
    {
      createTab: createTab,
      setActive: setActive,
      closeTab: closeTab,
      getActive: function () {
        return getTab(activeId)
      },
      getTab: getTab,
      getAllTabs: function () {
        return tabs
      },
      markModified: function (id, modified) {
        const tab = getTab(id)
        tab && ((tab.modified = modified), syncTabUi(tab), updateStatusBar(tab), syncUnsavedClass(), CacheManager.markDirty())
      },
      setTabTitle: function (id, title, filePath) {
        const tab = getTab(id)
        tab && ((tab.title = title), void 0 !== filePath && (tab.filePath = filePath), syncTabUi(tab), updateStatusBar(tab), CacheManager.markDirty())
      },
      restoreFromCache: function (cached) {
        cached.forEach(c => {
          const tab = createTab({ title: c.title, filePath: c.filePath, content: c.content })
          tab.id = c.id
          tab.scrollTop = c.scrollTop || 0
          tab.cursorPos = c.cursorPos || { line: 0, ch: 0 }
          const lastEl = document.querySelector('.tab:last-child')
          lastEl && (lastEl.dataset.id = c.id)
        })
      },
      onSwitch: function (cb) {
        onSwitchCb = cb
      },
      onClose: function (cb) {
        onCloseCb = cb
      },
      syncUnsavedClass: syncUnsavedClass,
      saveOrder: saveOrder,
      loadOrder: loadOrder,
      get activeTabId() {
        return activeId
      },
    }
  )
})()
