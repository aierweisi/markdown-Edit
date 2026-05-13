/**
 * cache.js — Auto-save and crash recovery
 */

const CacheManager = (() => {
  let autoSaveTimer = null
  let interval = 10000 // 10s default

  async function loadInterval() {
    const s = await window.api.storeGet('autoSaveInterval')
    interval = (s || 10) * 1000
  }

  function start() {
    stopTimer()
    autoSaveTimer = setInterval(saveAll, interval)
  }

  function stopTimer() {
    if (autoSaveTimer) clearInterval(autoSaveTimer)
  }

  function setInterval2(sec) {
    interval = sec * 1000
    start()
  }

  async function saveAll() {
    // 滚动位置不在 Doc 上,需要主动从编辑器同步给当前 tab
    const activeTab = TabManager.getActive()
    if (activeTab) {
      activeTab.scrollTop = EditorManager.getScrollTop()
    }

    // 每个 tab 的内容和光标由各自的 Doc 持有,序列化时直接从 Doc 取
    const tabs = TabManager.getAllTabs().map(t => ({
      id: t.id,
      title: t.title,
      filePath: t.filePath,
      content: t.doc ? t.doc.getValue() : (t.content || ''),
      scrollTop: t.scrollTop || 0,
      cursorPos: t.doc ? t.doc.getCursor() : { line: 0, ch: 0 },
      modified: t.modified
    }))

    const cache = {
      tabs,
      activeTabId: TabManager.activeTabId,
      savedAt: Date.now()
    }

    await window.api.storeSet('cache', cache)
    updateAutoSaveStatus()
  }

  function updateAutoSaveStatus() {
    const el = document.getElementById('status-autosave')
    if (!el) return
    const now = new Date()
    el.textContent = `已缓存 ${now.toLocaleTimeString('zh-CN', { hour12: false })}`
  }

  async function checkAndRestore() {
    const cache = await window.api.storeGet('cache')
    if (!cache || !cache.tabs || cache.tabs.length === 0) return false

    // Only restore if there's meaningful content
    const hasContent = cache.tabs.some(t => t.content && t.content.trim().length > 0)
    if (!hasContent) return false

    return cache
  }

  async function restore(cache) {
    // Clear existing tabs first
    const container = document.getElementById('tabs-container')
    container.innerHTML = ''

    // Re-create tabs from cache
    for (const ct of cache.tabs) {
      const tab = TabManager.createTab({
        title: ct.title,
        filePath: ct.filePath,
        content: ct.content
      })
      // Sync cached id to new tab
      const tabEl = document.querySelector(`.tab[data-id="${tab.id}"]`)
      tab.id = ct.id
      if (tabEl) tabEl.dataset.id = ct.id
      tab.scrollTop = ct.scrollTop || 0
      // 把光标恢复到 Doc 上（createTab 已经创建了带 content 的 Doc）
      if (tab.doc && ct.cursorPos) {
        try { tab.doc.setCursor(ct.cursorPos) } catch (_) {}
      }
      tab.modified = ct.modified || false
      if (tab.modified) {
        const el = document.querySelector(`.tab[data-id="${ct.id}"]`)
        if (el) el.classList.add('modified')
      }
    }
    // 同步保存按钮的脉冲提示状态
    if (TabManager.syncUnsavedClass) TabManager.syncUnsavedClass()

    const activeId = cache.activeTabId || cache.tabs[0]?.id
    if (activeId) {
      // Slight delay so editor is ready
      setTimeout(() => TabManager.setActive(activeId), 100)
    }
  }

  async function clearCache() {
    await window.api.storeSet('cache', {})
  }

  async function removeTab(id) {
    const cache = await window.api.storeGet('cache')
    if (!cache || !cache.tabs) return
    cache.tabs = cache.tabs.filter(t => t.id !== id)
    await window.api.storeSet('cache', cache)
  }

  function showRestoreDialog(cache) {
    return new Promise(resolve => {
      const overlay = document.getElementById('restore-overlay')
      const restoreTabs = document.getElementById('restore-tabs')

      // Show tab list
      restoreTabs.innerHTML = cache.tabs.map(t => {
        const savedAt = new Date(cache.savedAt).toLocaleString('zh-CN')
        return `<div class="restore-tab-item">
          <div>${t.title}</div>
          <span>${t.filePath || '未保存'} — ${savedAt}</span>
        </div>`
      }).join('')

      overlay.classList.add('open')

      function closeOverlay() {
        overlay.classList.remove('open')
        overlay.classList.add('closing')
        setTimeout(() => overlay.classList.remove('closing'), 180)
      }

      document.getElementById('restore-yes').onclick = () => {
        closeOverlay()
        resolve(true)
      }
      document.getElementById('restore-no').onclick = () => {
        closeOverlay()
        resolve(false)
      }
    })
  }

  return {
    start, stopTimer, setInterval2, loadInterval,
    saveAll, checkAndRestore, restore, clearCache,
    removeTab, showRestoreDialog
  }
})()
