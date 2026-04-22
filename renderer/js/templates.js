/**
 * templates.js — Template management
 */

const TemplateManager = (() => {
  function getBuiltin() {
    const now = new Date()
    const dateStr = now.toLocaleDateString('zh-CN')
    const timeStr = now.toLocaleString('zh-CN')

    function getWeekRange() {
      const day = now.getDay() || 7
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return `${mon.toLocaleDateString('zh-CN')} ~ ${sun.toLocaleDateString('zh-CN')}`
    }

    return [
      {
        id: 'builtin_blank',
        name: '空白文档',
        icon: '📄',
        builtin: true,
        content: ''
      },
      {
        id: 'builtin_diary',
        name: '日记',
        icon: '📔',
        builtin: true,
        content: `# ${dateStr} 日记\n\n## 今日心情\n\n\n\n## 今日记录\n\n\n\n## 明日计划\n\n- [ ] \n`
      },
      {
        id: 'builtin_weekly',
        name: '周报',
        icon: '📊',
        builtin: true,
        content: `# 周报 — ${getWeekRange()}\n\n## 本周完成\n\n- \n\n## 遇到的问题\n\n- \n\n## 下周计划\n\n- \n\n## 其他事项\n\n`
      },
      {
        id: 'builtin_techdoc',
        name: '技术文档',
        icon: '📖',
        builtin: true,
        content: `# 文档标题\n\n> 一句话简介\n\n## 概述\n\n## 快速开始\n\n\`\`\`bash\n# 安装\nnpm install\n\n# 运行\nnpm start\n\`\`\`\n\n## 使用说明\n\n## API 参考\n\n| 参数 | 类型 | 说明 |\n| --- | --- | --- |\n| name | string | 名称 |\n\n## 常见问题\n\n## 更新日志\n\n### v1.0.0\n\n- 初始版本\n`
      },
      {
        id: 'builtin_meeting',
        name: '会议记录',
        icon: '📝',
        builtin: true,
        content: `# 会议记录\n\n| | |\n|---|---|\n| **时间** | ${timeStr} |\n| **地点** | |\n| **主持人** | |\n| **参与人** | |\n\n## 议题\n\n1. \n2. \n\n## 讨论内容\n\n### 议题一\n\n\n\n## 决议事项\n\n- [ ] （负责人）\n- [ ] （负责人）\n\n## 下次会议\n\n- **时间：** \n- **议题：** \n`
      },
      {
        id: 'builtin_readme',
        name: 'README',
        icon: '🚀',
        builtin: true,
        content: `# 项目名称\n\n[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)\n\n> 项目简介，一两句话描述项目用途。\n\n## ✨ 特性\n\n- 特性一\n- 特性二\n- 特性三\n\n## 📦 安装\n\n\`\`\`bash\nnpm install project-name\n\`\`\`\n\n## 🚀 使用\n\n\`\`\`js\nconst project = require('project-name')\nproject.doSomething()\n\`\`\`\n\n## 📄 许可证\n\n[MIT](LICENSE)\n`
      }
    ]
  }

  let userTemplates = []
  let selectedId = null
  let applyCallback = null  // called when user clicks "apply"

  async function loadUserTemplates() {
    userTemplates = (await window.api.storeGet('templates')) || []
  }

  async function saveUserTemplates() {
    await window.api.storeSet('templates', userTemplates)
  }

  function getAllTemplates() {
    return [...getBuiltin(), ...userTemplates]
  }

  function open() {
    loadUserTemplates().then(() => {
      renderList()
      const toSelect = selectedId || getBuiltin()[0].id
      selectTemplate(toSelect)
    })
    document.getElementById('template-overlay').classList.add('open')
  }

  function close() {
    const overlay = document.getElementById('template-overlay')
    overlay.classList.remove('open')
    overlay.classList.add('closing')
    setTimeout(() => overlay.classList.remove('closing'), 180)
  }

  function renderList() {
    const list = document.getElementById('template-list')
    list.innerHTML = ''
    getAllTemplates().forEach(t => {
      const el = document.createElement('div')
      el.className = 'template-item' + (t.id === selectedId ? ' active' : '')
      el.dataset.id = t.id
      el.innerHTML = `
        <span style="display:flex;align-items:center;gap:6px">
          <span style="font-size:13px">${t.icon || '📄'}</span>
          ${t.name}
        </span>
        ${t.builtin ? '<span class="template-badge">内置</span>' : '<span class="template-badge">自定义</span>'}
      `
      el.addEventListener('click', () => selectTemplate(t.id))
      list.appendChild(el)
    })
  }

  function selectTemplate(id) {
    selectedId = id
    const all = getAllTemplates()
    const t = all.find(t => t.id === id)
    if (!t) return

    document.querySelectorAll('.template-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id)
    })

    const nameInput = document.getElementById('template-name-input')
    const contentInput = document.getElementById('template-content-input')
    const deleteBtn = document.getElementById('template-delete-btn')
    const saveBtn = document.getElementById('template-save-btn')

    nameInput.value = t.name
    contentInput.value = t.content
    nameInput.disabled = t.builtin
    contentInput.disabled = t.builtin
    if (deleteBtn) {
      deleteBtn.disabled = t.builtin
    }
    if (saveBtn) {
      saveBtn.disabled = t.builtin
      saveBtn.style.opacity = t.builtin ? '0.4' : '1'
    }
  }

  async function saveCurrentTemplate() {
    const nameInput = document.getElementById('template-name-input')
    const contentInput = document.getElementById('template-content-input')
    const name = nameInput.value.trim()
    const content = contentInput.value

    if (!name) { ExportManager.showToast('请输入模板名称'); return }

    if (selectedId && !selectedId.startsWith('builtin_')) {
      const t = userTemplates.find(t => t.id === selectedId)
      if (t) { t.name = name; t.content = content }
    } else {
      const id = 'user_' + Date.now()
      userTemplates.push({ id, name, content, icon: '📋', builtin: false })
      selectedId = id
    }

    await saveUserTemplates()
    renderList()
    selectTemplate(selectedId)
    ExportManager.showToast('模板已保存')
  }

  function newTemplate() {
    selectedId = null
    const nameInput = document.getElementById('template-name-input')
    const contentInput = document.getElementById('template-content-input')
    const deleteBtn = document.getElementById('template-delete-btn')
    const saveBtn = document.getElementById('template-save-btn')

    nameInput.value = ''
    contentInput.value = ''
    nameInput.disabled = false
    contentInput.disabled = false
    if (deleteBtn) deleteBtn.disabled = false
    if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1' }

    document.querySelectorAll('.template-item').forEach(el => el.classList.remove('active'))
    nameInput.focus()
  }

  async function deleteCurrentTemplate() {
    if (!selectedId || selectedId.startsWith('builtin_')) return
    if (!confirm('确定要删除此模板吗？')) return
    userTemplates = userTemplates.filter(t => t.id !== selectedId)
    await saveUserTemplates()
    selectedId = getBuiltin()[0].id
    renderList()
    selectTemplate(selectedId)
    ExportManager.showToast('模板已删除')
  }

  function applySelected() {
    const all = getAllTemplates()
    const t = all.find(t => t.id === selectedId)
    if (!t) return

    if (t.content.trim() === '' && t.id !== 'builtin_blank') return

    if (applyCallback) {
      applyCallback(t.content, t.name)
    }
    close()
    ExportManager.showToast(`已应用模板：${t.name}`)
  }

  function onApply(cb) {
    applyCallback = cb
  }

  function init() {
    document.getElementById('template-close').addEventListener('click', close)
    document.getElementById('template-save-btn').addEventListener('click', saveCurrentTemplate)
    document.getElementById('template-new-btn').addEventListener('click', newTemplate)
    document.getElementById('template-delete-btn').addEventListener('click', deleteCurrentTemplate)
    document.getElementById('template-apply-btn').addEventListener('click', applySelected)

    document.getElementById('template-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close()
    })

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('template-overlay').classList.contains('open')) close()
      }
    })
  }

  return { init, open, close, getAllTemplates, onApply, loadUserTemplates }
})()
