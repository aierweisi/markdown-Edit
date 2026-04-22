/**
 * settings.js — Settings panel
 */

const SettingsManager = (() => {
  let settings = {}

  async function load() {
    settings = {
      theme: (await window.api.storeGet('theme')) || 'light',
      fontSize: (await window.api.storeGet('fontSize')) || 15,
      editorFont: (await window.api.storeGet('editorFont')) || "'JetBrains Mono', 'Fira Code', monospace",
      autoSaveInterval: (await window.api.storeGet('autoSaveInterval')) || 10,
      exportDir: (await window.api.storeGet('exportDir')) || '',
      exportNamingRule: (await window.api.storeGet('exportNamingRule')) || '{title}_{date}'
    }
    return settings
  }

  function applyTheme(theme) {
    document.body.classList.remove('theme-light', 'theme-dark')
    document.body.classList.add(`theme-${theme}`)
    EditorManager.setTheme(theme === 'dark')
    PreviewManager.updateTheme(theme === 'dark')
    // Update toolbar theme button icon
    const btn = document.getElementById('btn-theme')
    if (btn) {
      const icon = btn.querySelector('svg')
      if (icon) {
        if (theme === 'dark') {
          icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
        } else {
          icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
        }
      }
    }
  }

  function applyFontSize(size) {
    EditorManager.setFontSize(size)
  }

  function applyEditorFont(font) {
    EditorManager.setFont(font)
    document.documentElement.style.setProperty('--font-mono', font)
  }

  // Switch visible panel in settings modal
  function switchPanel(panelId) {
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.panel === panelId)
    })
    document.querySelectorAll('.settings-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${panelId}`)
    })
  }

  // Sync theme toggle buttons to reflect current theme
  function syncThemeButtons(theme) {
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme)
    })
  }

  async function open(panelId = 'appearance') {
    await load()

    // Populate editor panel
    document.getElementById('setting-fontsize').value = settings.fontSize
    document.getElementById('setting-editorfont').value = settings.editorFont

    // Populate autosave panel
    document.getElementById('setting-autosave').value = settings.autoSaveInterval

    // Populate export panel
    document.getElementById('setting-exportdir').value = settings.exportDir
    document.getElementById('setting-namingrule').value = settings.exportNamingRule

    // Sync theme toggle buttons
    syncThemeButtons(settings.theme)

    // Switch to requested panel
    switchPanel(panelId)

    document.getElementById('settings-overlay').classList.add('open')
  }

  function close() {
    const overlay = document.getElementById('settings-overlay')
    overlay.classList.remove('open')
    overlay.classList.add('closing')
    setTimeout(() => overlay.classList.remove('closing'), 180)
  }

  async function save() {
    // Read theme from active toggle button
    const activeThemeBtn = document.querySelector('.theme-toggle-btn.active')
    const theme = activeThemeBtn ? activeThemeBtn.dataset.theme : 'light'

    const fontSize = parseInt(document.getElementById('setting-fontsize').value)
    const editorFont = document.getElementById('setting-editorfont').value
    const autoSaveInterval = parseInt(document.getElementById('setting-autosave').value)
    const exportDir = document.getElementById('setting-exportdir').value
    const exportNamingRule = document.getElementById('setting-namingrule').value.trim() || '{title}_{date}'

    await window.api.storeSet('theme', theme)
    await window.api.storeSet('fontSize', fontSize)
    await window.api.storeSet('editorFont', editorFont)
    await window.api.storeSet('autoSaveInterval', autoSaveInterval)
    await window.api.storeSet('exportDir', exportDir)
    await window.api.storeSet('exportNamingRule', exportNamingRule)

    applyTheme(theme)
    applyFontSize(fontSize)
    applyEditorFont(editorFont)
    CacheManager.setInterval2(autoSaveInterval)

    close()
    ExportManager.showToast('设置已保存')
  }

  function toggleTheme() {
    const current = document.body.classList.contains('theme-dark') ? 'dark' : 'light'
    const next = current === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    window.api.storeSet('theme', next)
    // Sync buttons if modal is open
    syncThemeButtons(next)
  }

  function init() {
    // Close button
    document.getElementById('settings-close').addEventListener('click', close)

    // Save button
    document.getElementById('settings-save-btn').addEventListener('click', save)

    // Overlay click to close
    document.getElementById('settings-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close()
    })

    // Nav item switching
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', () => switchPanel(item.dataset.panel))
    })

    // Theme toggle buttons
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-toggle-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
    })

    // Naming variable chips — insert at cursor or append
    document.querySelectorAll('.naming-var-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const input = document.getElementById('setting-namingrule')
        const varText = chip.dataset.var
        const start = input.selectionStart
        const end = input.selectionEnd
        const val = input.value
        input.value = val.slice(0, start) + varText + val.slice(end)
        const newPos = start + varText.length
        input.setSelectionRange(newPos, newPos)
        input.focus()
      })
    })

    // Export dir selector
    document.getElementById('setting-exportdir-btn').addEventListener('click', async () => {
      const result = await window.api.dialogSelectDir()
      if (!result.canceled && result.filePaths.length) {
        document.getElementById('setting-exportdir').value = result.filePaths[0]
      }
    })
  }

  return { init, load, open, close, save, applyTheme, applyFontSize, applyEditorFont, toggleTheme }
})()
