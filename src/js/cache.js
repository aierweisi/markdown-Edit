window.CacheManager = (() => {
  let timerId = null,
    intervalMs = 1e4,
    lastHash = '',
    dirty = true

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
    if (window.__isSaving || !dirty) return
    dirty = false
    const activeTab = TabManager.getActive(),
      activeId = activeTab ? activeTab.id : null
    activeTab && (activeTab.scrollTop = EditorManager.getScrollTop())

    const cache = {
      tabs: TabManager.getAllTabs().map(function (tab) {
        return {
          id: tab.id,
          title: tab.title,
          filePath: tab.filePath,
          content: tab.id === activeId ? (tab.doc ? tab.doc.getValue() : tab.content || '') : '',
          scrollTop: tab.scrollTop || 0,
          cursorPos: tab.doc ? tab.doc.getCursor() : { line: 0, ch: 0 },
          modified: tab.modified,
        }
      }),
      activeTabId: activeId,
      savedAt: Date.now(),
    }

    const hashStr =
      cache.tabs.map(t => `${t.id}:${t.content}|${t.modified}`).join('||') + `|${activeId}`
    if (hashStr === lastHash) return
    lastHash = hashStr

    await window.api.storeSet('cache', cache)
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
    restore: async function (cache) {
      document.getElementById('tabs-container').innerHTML = ''
      for (const tabData of cache.tabs) {
        try {
          const newTab = TabManager.createTab({
              title: tabData.title,
              filePath: tabData.filePath,
              content: tabData.content,
            }),
            tabEl = document.querySelector(`.tab[data-id="${newTab.id}"]`)
          newTab.id = tabData.id
          if (tabEl) tabEl.dataset.id = tabData.id
          newTab.scrollTop = tabData.scrollTop || 0
          if (newTab.doc && tabData.cursorPos)
            try {
              newTab.doc.setCursor(tabData.cursorPos)
            } catch (_err) {}
          newTab.modified = tabData.modified || !1
          if (newTab.modified) {
            const el = document.querySelector(`.tab[data-id="${tabData.id}"]`)
            el && el.classList.add('modified')
          }
        } catch (_err) {
          console.warn('[Cache] 跳过损坏的标签缓存:', tabData?.title)
        }
      }
      TabManager.syncUnsavedClass && TabManager.syncUnsavedClass()
      dirty = true
      const firstId = cache.activeTabId || cache.tabs[0]?.id
      firstId && setTimeout(() => TabManager.setActive(firstId), 100)
    },
    clearCache: async function () {
      await window.api.storeSet('cache', {})
    },
    removeTab: async function (tabId) {
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
