window.CacheManager = (() => {
  let t = null,
    e = 1e4,
    lastHash = '',
    dirty = true
  function a() {
    (n(), (t = setInterval(o, e)))
  }
  function n() {
    t && clearInterval(t)
  }
  function markDirty() {
    dirty = true
  }
  async function o() {
    if (window.__isSaving || !dirty) return
    dirty = false
    const _t = TabManager.getActive(),
      activeId = _t ? _t.id : null
    _t && (_t.scrollTop = EditorManager.getScrollTop())
    const e = {
      tabs: TabManager.getAllTabs().map(function (t) {
        return {
          id: t.id,
          title: t.title,
          filePath: t.filePath,
          content: t.id === activeId ? (t.doc ? t.doc.getValue() : t.content || '') : '',
          scrollTop: t.scrollTop || 0,
          cursorPos: t.doc ? t.doc.getCursor() : { line: 0, ch: 0 },
          modified: t.modified,
        }
      }),
      activeTabId: activeId,
      savedAt: Date.now(),
    }
    const hashStr =
      e.tabs.map(t => `${t.id}:${t.content}|${t.modified}`).join('||') + `|${activeId}`
    if (hashStr === lastHash) return
    lastHash = hashStr
    ;(await window.api.storeSet('cache', e),
      (function () {
        const t = document.getElementById('status-autosave')
        if (!t) return
        const e = new Date()
        t.textContent = `已缓存 ${e.toLocaleTimeString('zh-CN', { hour12: !1 })}`
      })())
  }
  return {
    start: a,
    stopTimer: n,
    markDirty,
    setAutoSaveInterval: function (t) {
      ((e = 1e3 * t), a())
    },
    loadInterval: async function () {
      const t = await window.api.storeGet('autoSaveInterval')
      e = 1e3 * (t || 10)
    },
    saveAll: o,
    checkAndRestore: async function () {
      const t = await window.api.storeGet('cache')
      return (
        !(!t || !t.tabs || 0 === t.tabs.length) &&
        !!t.tabs.some(t => t.content && t.content.trim().length > 0) &&
        t
      )
    },
    restore: async function (t) {
      document.getElementById('tabs-container').innerHTML = ''
      for (const e of t.tabs) {
        const a = TabManager.createTab({
            title: e.title,
            filePath: e.filePath,
            content: e.content,
          }),
          n = document.querySelector(`.tab[data-id="${a.id}"]`)
        a.id = e.id
        if (n) n.dataset.id = e.id
        a.scrollTop = e.scrollTop || 0
        if (a.doc && e.cursorPos)
          try {
            a.doc.setCursor(e.cursorPos)
          } catch (t) {}
        a.modified = e.modified || !1
        if (a.modified) {
          const t = document.querySelector(`.tab[data-id="${e.id}"]`)
          t && t.classList.add('modified')
        }
      }
      TabManager.syncUnsavedClass && TabManager.syncUnsavedClass()
      dirty = true
      const e = t.activeTabId || t.tabs[0]?.id
      e && setTimeout(() => TabManager.setActive(e), 100)
    },
    clearCache: async function () {
      await window.api.storeSet('cache', {})
    },
    removeTab: async function (t) {
      const e = await window.api.storeGet('cache')
      e &&
        e.tabs &&
        ((e.tabs = e.tabs.filter(e => e.id !== t)), await window.api.storeSet('cache', e))
    },
    showRestoreDialog: function (t) {
      return new Promise(e => {
        const a = document.getElementById('restore-overlay')
        function n() {
          (a.classList.remove('open'),
            a.classList.add('closing'),
            setTimeout(() => a.classList.remove('closing'), 180))
        }
        ((document.getElementById('restore-tabs').innerHTML = t.tabs
          .map(e => {
            const a = new Date(t.savedAt).toLocaleString('zh-CN')
            return `<div class="restore-tab-item">\n          <div>${e.title}</div>\n          <span>${e.filePath || '未保存'} — ${a}</span>\n        </div>`
          })
          .join('')),
          a.classList.add('open'),
          (document.getElementById('restore-yes').onclick = () => {
            (n(), e(!0))
          }),
          (document.getElementById('restore-no').onclick = () => {
            (n(), e(!1))
          }))
      })
    },
  }
})()
