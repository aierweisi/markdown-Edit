window.CacheManager = (() => {
  let timerId = null,
    intervalMs = 1e4,
    lastHash = '',
    dirty = true,
    _persistLockAcquired = false
  // 持久化缓存已保存的快照，增量保存时只重新序列化变化的 tab
  const lastSavedTabs = new Map()  // tabId → cachedTabData

  async function acquireLock() {
    const startTime = Date.now()
    while (_persistLockAcquired) {
      if (Date.now() - startTime > 5000) {
        console.warn('[Cache] Persist lock wait timeout (5s), forcing release')
        break
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    _persistLockAcquired = true
  }
  function releaseLock() {
    _persistLockAcquired = false
  }

  function startTimer() {
    stopTimer()
    timerId = setInterval(saveToStore, intervalMs)
  }

  function stopTimer() {
    timerId && clearInterval(timerId)
  }

  function markDirty() {
    dirty = true
  }

  async function saveToStore() {
    if (window.__isSaving || _persistLockAcquired || !dirty) return
    dirty = false
    const activeTab = TabManager.getActive(),
      activeId = activeTab ? activeTab.id : null
    activeTab && (activeTab.scrollTop = EditorManager.getScrollTop())

    // 增量序列化：只对 active tab 做 getValue()，非活跃 tab 复用上次保存的快照
    const allTabs = TabManager.getAllTabs()
    const tabs = []

    for (const tab of allTabs) {
      const id = tab.id
      if (id === activeId) {
        // 活跃 tab：总是重新序列化（内容可能已变化）
        const content = tab.doc ? tab.doc.getValue() : (tab.content || '')
        const tabData = {
          id: id,
          title: tab.title,
          filePath: tab.filePath,
          content: content,
          scrollTop: tab.scrollTop || 0,
          cursorPos: tab.doc ? tab.doc.getCursor() : { line: 0, ch: 0 },
          modified: tab.modified,
        }
        lastSavedTabs.set(id, tabData)
        tabs.push(tabData)
      } else {
        // 非活跃 tab：复用快照（如果快照仍有效）
        const cached = lastSavedTabs.get(id)
        if (
          cached &&
          cached.title === tab.title &&
          cached.filePath === tab.filePath &&
          cached.modified === tab.modified &&
          cached.scrollTop === (tab.scrollTop || 0)
        ) {
          tabs.push(cached)
        } else {
          // 快照失效（标题/路径/修改状态变化）：重新序列化
          const content = tab.doc ? tab.doc.getValue() : (tab.content || '')
          const tabData = {
            id: id,
            title: tab.title,
            filePath: tab.filePath,
            content: content,
            scrollTop: tab.scrollTop || 0,
            cursorPos: tab.doc ? tab.doc.getCursor() : { line: 0, ch: 0 },
            modified: tab.modified,
          }
          lastSavedTabs.set(id, tabData)
          tabs.push(tabData)
        }
      }
    }

    // 清理已关闭 tab 的快照
    const currentIds = new Set(allTabs.map(t => t.id))
    for (const key of lastSavedTabs.keys()) {
      if (!currentIds.has(key)) lastSavedTabs.delete(key)
    }

    const cache = {
      tabs: tabs,
      activeTabId: activeId,
      savedAt: Date.now(),
    }

    const hashObj = {
      tabs: tabs.map(t => ({ id: t.id, content: t.content, modified: t.modified })),
      activeId,
    }
    const hashStr = JSON.stringify(hashObj)
    if (hashStr === lastHash) return
    lastHash = hashStr

    await acquireLock()
    try {
      await window.api.storeSet('cache', cache)
    } finally {
      releaseLock()
    }
    ;(function () {
      const el = document.getElementById('status-autosave')
      if (!el) return
      const now = new Date()
      el.textContent = `已缓存 ${now.toLocaleTimeString('zh-CN', { hour12: !1 })}`
    })()
  }

  return {
    start: startTimer,
    stopTimer: stopTimer,
    markDirty: markDirty,
    setAutoSaveInterval: function (seconds) {
      intervalMs = 1e3 * seconds
      startTimer()
    },
    loadInterval: async function () {
      const seconds = await window.api.storeGet('autoSaveInterval')
      intervalMs = 1e3 * (seconds || 10)
    },
    saveAll: saveToStore,
    acquirePersistLock: acquireLock,
    releasePersistLock: releaseLock,
    checkAndRestore: async function () {
      let cache
      try {
        cache = await window.api.storeGet('cache')
      } catch (_err) {
        return !1
      }
      if (!cache || 'object' != typeof cache || !cache.tabs || !Array.isArray(cache.tabs)) return !1
      if (0 === cache.tabs.length) return !1
      const validTabs = cache.tabs.filter(
        tab =>
          tab && 'object' == typeof tab && 'string' == typeof tab.content && tab.content.trim().length > 0,
      )
      return validTabs.length > 0 ? ((cache.tabs = validTabs), cache) : !1
    },
    restore: async function (cache, opts = {}) {
      document.getElementById('tabs-container').innerHTML = ''
      const idMap = {}  // old ID → new ID
      for (const tabData of cache.tabs) {
        try {
          const newTab = TabManager.createTab({
              title: tabData.title,
              filePath: tabData.filePath,
              content: tabData.content,
            })
          idMap[tabData.id] = newTab.id
          newTab.scrollTop = tabData.scrollTop || 0
          if (newTab.doc && tabData.cursorPos)
            try {
              newTab.doc.setCursor(tabData.cursorPos)
            } catch (_err) {}
          newTab.modified = tabData.modified || !1
          if (newTab.modified) {
            const el = document.querySelector(`.tab[data-id="${newTab.id}"]`)
            el && el.classList.add('modified')
          }
        } catch (_err) {
          console.warn('[Cache] 跳过损坏的标签缓存:', tabData?.title)
        }
      }
      TabManager.syncUnsavedClass && TabManager.syncUnsavedClass()
      dirty = true
      const oldActiveId = cache.activeTabId || cache.tabs[0]?.id
      const newActiveId = oldActiveId ? idMap[oldActiveId] : null
      const firstId = newActiveId || (cache.tabs.length > 0 ? idMap[cache.tabs[0].id] : null)
      firstId && requestAnimationFrame(() => {
        if (opts.skipActivate) return
        // 守卫：如果 tab 系统已被清空或目标 tab 已被删除，则跳过激活
        const allTabs = TabManager.getAllTabs()
        if (!allTabs || allTabs.length === 0 || !allTabs.some(t => t.id === firstId)) return
        // 确保在 tab 激活前欢迎页覆盖层已被隐藏
        const overlay = document.getElementById('welcome-overlay')
        overlay && overlay.classList.add('hidden')
        TabManager.setActive(firstId)
      })
    },
    clearCache: async function () {
      await window.api.storeSet('cache', {})
    },
    removeTab: async function (tabId) {
      lastSavedTabs.delete(tabId)
      const cache = await window.api.storeGet('cache')
      if (cache && cache.tabs && Array.isArray(cache.tabs)) {
        cache.tabs = cache.tabs.filter(t => t.id !== tabId)
        await window.api.storeSet('cache', cache)
      }
    },
    showRestoreDialog: function (cache) {
      return new Promise(resolve => {
        const overlay = document.getElementById('restore-overlay')
        function closeOverlay() {
          overlay.classList.remove('open')
          overlay.classList.add('closing')
          setTimeout(() => overlay.classList.remove('closing'), 180)
        }
        document.getElementById('restore-tabs').innerHTML = cache.tabs
          .map(tab => {
            const timeStr = new Date(cache.savedAt).toLocaleString('zh-CN')
            return `<div class="restore-tab-item">\n          <div>${tab.title}</div>\n          <span>${tab.filePath || '未保存'} — ${timeStr}</span>\n        </div>`
          })
          .join('')
        overlay.classList.add('open')
        document.getElementById('restore-yes').onclick = () => {
          closeOverlay()
          resolve(!0)
        }
        document.getElementById('restore-no').onclick = () => {
          closeOverlay()
          resolve(!1)
        }
      })
    },
  }
})()
