window.SettingsManager = (() => {
  let settings = {}

  async function loadFromStore() {
    const [
      theme,
      fontSize,
      editorFont,
      autoSaveInterval,
      exportDir,
      exportNamingRule,
      imageSaveDir,
    ] = await Promise.all([
      window.api.storeGet('theme'),
      window.api.storeGet('fontSize'),
      window.api.storeGet('editorFont'),
      window.api.storeGet('autoSaveInterval'),
      window.api.storeGet('exportDir'),
      window.api.storeGet('exportNamingRule'),
      window.api.storeGet('imageSaveDir'),
    ])
    return (
      (settings = {
        theme: theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
        fontSize: fontSize || 15,
        editorFont: editorFont || "'JetBrains Mono', 'Fira Code', monospace",
        autoSaveInterval: autoSaveInterval || 10,
        exportDir: exportDir || '',
        exportNamingRule: exportNamingRule || '{title}_{date}',
        imageSaveDir: imageSaveDir || 'assets',
      }),
      settings
    )
  }

  function applyTheme(theme) {
    document.body.classList.remove('theme-light', 'theme-dark')
    document.body.classList.add(`theme-${theme}`)
    EditorManager.setTheme()
    PreviewManager.updateTheme('dark' === theme)
    window.api &&
      window.api.updateTitleBar &&
      ('dark' === theme
        ? window.api.updateTitleBar({ color: '#0d0d10', symbolColor: '#e8e8ec' })
        : window.api.updateTitleBar({ color: '#ffffff', symbolColor: '#1c1e21' }))
    const btn = document.getElementById('btn-theme')
    if (btn) {
      const svg = btn.querySelector('svg')
      svg &&
        (svg.innerHTML =
          'dark' === theme
            ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
            : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>')
    }
  }

  function applyFontSize(size) {
    EditorManager.setFontSize(size)
  }

  function applyEditorFont(font) {
    EditorManager.setFont(font)
    document.documentElement.style.setProperty('--font-mono', font)
  }

  function switchPanel(panelId) {
    document.querySelectorAll('.settings-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.panel === panelId)
    })
    document.querySelectorAll('.settings-panel').forEach(el => {
      el.classList.toggle('active', el.id === `panel-${panelId}`)
    })
  }

  function syncThemeBtns(theme) {
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme)
    })
  }

  function closeModal() {
    const overlay = document.getElementById('settings-overlay')
    overlay.classList.remove('open')
    overlay.classList.add('closing')
    setTimeout(() => overlay.classList.remove('closing'), 180)
  }

  async function saveSettings() {
    const activeBtn = document.querySelector('.theme-toggle-btn.active'),
      theme = activeBtn ? activeBtn.dataset.theme : 'light',
      fontSize = parseInt(document.getElementById('setting-fontsize').value),
      editorFont = document.getElementById('setting-editorfont').value,
      autoSave = parseInt(document.getElementById('setting-autosave').value),
      exportDir = document.getElementById('setting-exportdir').value,
      namingRule = document.getElementById('setting-namingrule').value.trim() || '{title}_{date}',
      imageDir = document.getElementById('setting-imagedir').value.trim() || 'assets'
    await window.api.storeSet('theme', theme)
    await window.api.storeSet('fontSize', fontSize)
    await window.api.storeSet('editorFont', editorFont)
    await window.api.storeSet('autoSaveInterval', autoSave)
    await window.api.storeSet('exportDir', exportDir)
    await window.api.storeSet('exportNamingRule', namingRule)
    await window.api.storeSet('imageSaveDir', imageDir)
    applyTheme(theme)
    applyFontSize(fontSize)
    applyEditorFont(editorFont)
    CacheManager.setAutoSaveInterval(autoSave)
    closeModal()
    ExportManager.showToast('设置已保存')
  }

  return {
    init: function () {
      document.getElementById('settings-close').addEventListener('click', closeModal)
      document.getElementById('settings-save-btn').addEventListener('click', saveSettings)
      document.getElementById('settings-overlay').addEventListener('click', evt => {
        evt.target === evt.currentTarget && closeModal()
      })
      document.querySelectorAll('.settings-nav-item').forEach(el => {
        el.addEventListener('click', () => switchPanel(el.dataset.panel))
      })
      document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.theme-toggle-btn').forEach(b => b.classList.remove('active'))
          btn.classList.add('active')
        })
      })
      document.querySelectorAll('.naming-var-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const input = document.getElementById('setting-namingrule'),
            varStr = chip.dataset.var,
            start = input.selectionStart,
            end = input.selectionEnd,
            currentVal = input.value
          input.value = currentVal.slice(0, start) + varStr + currentVal.slice(end)
          const newPos = start + varStr.length
          input.setSelectionRange(newPos, newPos)
          input.focus()
        })
      })
      document.getElementById('setting-exportdir-btn').addEventListener('click', async () => {
        const result = await window.api.dialogSelectDir()
        !result.canceled &&
          result.filePaths.length &&
          (document.getElementById('setting-exportdir').value = result.filePaths[0])
      })
      document.getElementById('setting-imagedir-btn').addEventListener('click', async () => {
        const result = await window.api.dialogSelectDir()
        !result.canceled &&
          result.filePaths.length &&
          (document.getElementById('setting-imagedir').value = result.filePaths[0])
      })
      const clearBtn = document.getElementById('setting-clear-cache-btn')
      clearBtn &&
        clearBtn.addEventListener('click', async () => {
          if (
            !(await window.showConfirm(
              '确定清空缓存?将清理 HTTP/代码/GPU 缓存与本地存储,不影响您的设置和文档。',
              { title: '清空缓存', okText: '清空', danger: !0 },
            ))
          )
            return
          const origText = clearBtn.textContent
          clearBtn.disabled = !0
          clearBtn.textContent = '清理中...'
          const result = await window.api.clearCache()
          clearBtn.disabled = !1
          if (result && result.success) {
            const freed = result.freed ? ` (释放 ${(result.freed / 1024 / 1024).toFixed(1)} MB)` : ''
            clearBtn.textContent = '已清空' + freed
            window.ExportManager && ExportManager.showToast && ExportManager.showToast('缓存已清空' + freed)
          } else
            (clearBtn.textContent = '清空失败'),
              ExportManager.showToast('清空缓存失败：' + ((result && result.error) || '未知错误'))
          setTimeout(() => {
            clearBtn.textContent = origText
          }, 2200)
        })
    },
    load: loadFromStore,
    open: async function (panelId = 'appearance') {
      await loadFromStore()
      document.getElementById('setting-fontsize').value = settings.fontSize
      document.getElementById('setting-editorfont').value = settings.editorFont
      document.getElementById('setting-autosave').value = settings.autoSaveInterval
      document.getElementById('setting-exportdir').value = settings.exportDir
      document.getElementById('setting-namingrule').value = settings.exportNamingRule
      document.getElementById('setting-imagedir').value = settings.imageSaveDir
      syncThemeBtns(settings.theme)
      switchPanel(panelId)
      document.getElementById('settings-overlay').classList.add('open')
    },
    close: closeModal,
    save: saveSettings,
    applyTheme: applyTheme,
    applyFontSize: applyFontSize,
    applyEditorFont: applyEditorFont,
    toggleTheme: function () {
      const current = document.body.classList.contains('theme-dark') ? 'dark' : 'light',
        next = 'dark' === current ? 'light' : 'dark'
      applyTheme(next)
      window.api.storeSet('theme', next)
      syncThemeBtns(next)
    },
  }
})()
