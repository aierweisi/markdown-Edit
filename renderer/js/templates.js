/**
 * templates.js
 */
const TemplateManager = (() => {

  const BUILTIN_DEFAULTS = [
    // ── 需求描述类 ──────────────────────────────────────────
    { id: 'b_prd', name: '产品需求文档 (PRD)', icon: '📋', content: () => `# 产品需求文档 (PRD)\n\n| | |\n|---|---|\n| **项目名称** |  |\n| **版本** | v1.0 |\n| **作者** |  |\n| **创建日期** | ${new Date().toLocaleDateString('zh-CN')} |\n| **状态** | 🟡 草稿 / 🟢 已评审 / 🔴 已归档 |\n\n## 1. 背景与目标\n\n### 1.1 项目背景\n\n> 描述当前业务现状、遇到的问题或机会点。\n\n### 1.2 目标用户\n\n- **主要用户**：\n- **次要用户**：\n\n### 1.3 产品目标\n\n- [ ] 目标一（可量化，如"提升转化率 10%"）\n- [ ] 目标二\n\n## 2. 需求概述\n\n### 2.1 核心功能\n\n| 编号 | 功能名称 | 优先级 | 说明 |\n|---|---|---|---|\n| F-001 |  | P0 |  |\n| F-002 |  | P1 |  |\n\n### 2.2 非目标（Out of Scope）\n\n- 本期**不做**的事项，避免范围蔓延。\n\n## 3. 详细需求\n\n### 3.1 功能 F-001：xxx\n\n**用户故事**\n> 作为 **[角色]**，我希望 **[功能]**，以便 **[价值]**。\n\n**功能描述**\n\n**交互流程**\n\n1. 用户进入 xxx 页面\n2. ...\n\n**边界条件 / 异常处理**\n\n- \n\n## 4. 非功能需求\n\n- **性能**：接口响应 < 300ms (P95)\n- **兼容性**：Chrome 90+ / Safari 14+\n- **安全**：\n- **可用性**：99.9%\n\n## 5. 里程碑与排期\n\n| 阶段 | 交付物 | 负责人 | 计划时间 |\n|---|---|---|---|\n| 需求评审 |  |  |  |\n| 设计评审 |  |  |  |\n| 开发完成 |  |  |  |\n| 测试完成 |  |  |  |\n| 正式发布 |  |  |  |\n\n## 6. 风险与依赖\n\n- **风险**：\n- **依赖**：\n\n## 7. 衡量指标\n\n- 北极星指标：\n- 辅助指标：\n\n## 附录\n\n- 相关文档链接：\n- 竞品分析：\n` },

    { id: 'b_userstory', name: '用户故事 (User Story)', icon: '👤', content: `# 用户故事\n\n## 基本信息\n\n| | |\n|---|---|\n| **Story ID** | US-001 |\n| **优先级** | P0 / P1 / P2 |\n| **估时** |  story points |\n| **迭代** |  |\n\n## 故事描述\n\n> **作为** [用户角色]\n> **我希望** [期望的功能]\n> **以便** [获得的价值/解决的问题]\n\n## 背景与动机\n\n\n\n## 验收标准 (Acceptance Criteria)\n\n- [ ] **场景 1**: Given [前置条件], When [操作], Then [预期结果]\n- [ ] **场景 2**: Given ..., When ..., Then ...\n- [ ] **场景 3**: ...\n\n## UI / 原型\n\n> 附上设计稿链接或截图\n\n## 技术说明\n\n- 涉及模块：\n- 接口改动：\n- 数据变更：\n\n## 相关需求 / 依赖\n\n- 前置依赖：\n- 关联故事：\n\n## 风险提示\n\n- \n` },

    { id: 'b_brd', name: '业务需求文档 (BRD)', icon: '💼', content: () => `# 业务需求文档 (BRD)\n\n**版本**：v1.0　　**日期**：${new Date().toLocaleDateString('zh-CN')}　　**负责人**：\n\n## 一、执行摘要\n\n> 用 3~5 句话说清楚"做什么、为什么做、预期收益"。\n\n## 二、业务背景\n\n### 2.1 市场现状\n\n\n\n### 2.2 业务痛点\n\n| 痛点 | 影响范围 | 量化指标 |\n|---|---|---|\n|  |  |  |\n\n### 2.3 机会点\n\n\n\n## 三、业务目标\n\n| 目标 | 关键结果 (KR) | 达成时间 |\n|---|---|---|\n| 增长 |  |  |\n| 留存 |  |  |\n| 收入 |  |  |\n\n## 四、业务方案\n\n### 4.1 方案概述\n\n\n\n### 4.2 业务流程\n\n\`\`\`mermaid\ngraph LR\n  A[开始] --> B[步骤]\n  B --> C[结束]\n\`\`\`\n\n### 4.3 角色与职责\n\n| 角色 | 职责 |\n|---|---|\n|  |  |\n\n## 五、投入产出分析\n\n### 5.1 预计投入\n\n- 人力：产品 x 人月、研发 x 人月、设计 x 人月\n- 其他成本：\n\n### 5.2 预计收益\n\n- 直接收益：\n- 间接收益：\n\n### 5.3 ROI 评估\n\n\n\n## 六、风险与应对\n\n| 风险 | 概率 | 影响 | 应对策略 |\n|---|---|---|---|\n|  | 高/中/低 | 高/中/低 |  |\n\n## 七、决策建议\n\n- [ ] 通过\n- [ ] 修改后通过\n- [ ] 暂缓 / 拒绝\n\n**审批人签字**：________________\n` },

    { id: 'b_featurereq', name: '功能需求规格', icon: '🧩', content: `# 功能需求规格说明\n\n## 1. 功能标识\n\n| | |\n|---|---|\n| **功能名称** |  |\n| **功能 ID** | FR-001 |\n| **所属模块** |  |\n| **优先级** | P0 |\n\n## 2. 功能概述\n\n> 一句话描述该功能做什么。\n\n## 3. 适用场景\n\n1. 场景 A：\n2. 场景 B：\n\n## 4. 输入 / 输出\n\n### 输入\n\n| 字段 | 类型 | 必填 | 说明 |\n|---|---|---|---|\n|  |  |  |  |\n\n### 输出\n\n| 字段 | 类型 | 说明 |\n|---|---|---|\n|  |  |  |\n\n## 5. 业务规则\n\n- 规则 1：\n- 规则 2：\n\n## 6. 处理流程\n\n1. 校验输入\n2. 业务处理\n3. 返回结果\n\n## 7. 异常处理\n\n| 异常码 | 触发条件 | 处理方式 | 用户提示 |\n|---|---|---|---|\n| E001 |  |  |  |\n\n## 8. 权限与安全\n\n- 访问角色：\n- 敏感数据：\n\n## 9. 性能要求\n\n- 响应时间：\n- 并发量：\n\n## 10. 验收用例\n\n- [ ] TC-001：\n- [ ] TC-002：\n` },

    { id: 'b_apispec', name: 'API 接口需求', icon: '🔌', content: `# API 接口需求文档\n\n## 基本信息\n\n| | |\n|---|---|\n| **接口名称** |  |\n| **接口路径** | \`POST /api/v1/xxx\` |\n| **所属模块** |  |\n| **版本** | v1 |\n| **鉴权** | Bearer Token |\n\n## 功能说明\n\n> 描述这个接口做什么。\n\n## 请求参数\n\n### Headers\n\n| 字段 | 必填 | 说明 |\n|---|---|---|\n| Authorization | 是 | Bearer {token} |\n| Content-Type | 是 | application/json |\n\n### Body\n\n\`\`\`json\n{\n  "name": "string",\n  "age": 0\n}\n\`\`\`\n\n| 字段 | 类型 | 必填 | 说明 |\n|---|---|---|---|\n| name | string | 是 | 名称 |\n| age | number | 否 | 年龄 |\n\n## 响应\n\n### 成功 (200)\n\n\`\`\`json\n{\n  "code": 0,\n  "data": {\n    "id": "123"\n  },\n  "message": "ok"\n}\n\`\`\`\n\n### 错误码\n\n| code | message | 说明 |\n|---|---|---|\n| 40001 | invalid params |  |\n| 40301 | forbidden |  |\n| 50000 | server error |  |\n\n## 业务规则\n\n- \n\n## 性能要求\n\n- QPS：\n- 响应时间：P95 < 200ms\n\n## 调用示例\n\n\`\`\`bash\ncurl -X POST https://api.example.com/v1/xxx \\\\\n  -H "Authorization: Bearer xxx" \\\\\n  -H "Content-Type: application/json" \\\\\n  -d '{"name":"test"}'\n\`\`\`\n\n## 变更记录\n\n| 版本 | 日期 | 变更 | 作者 |\n|---|---|---|---|\n| v1 |  | 初版 |  |\n` },

    { id: 'b_bugreport', name: 'Bug 报告', icon: '🐛', content: () => `# Bug 报告\n\n| | |\n|---|---|\n| **标题** |  |\n| **Bug ID** | BUG-001 |\n| **报告人** |  |\n| **报告日期** | ${new Date().toLocaleDateString('zh-CN')} |\n| **严重程度** | 🔴 阻塞 / 🟠 严重 / 🟡 一般 / 🟢 轻微 |\n| **优先级** | P0 / P1 / P2 / P3 |\n| **状态** | 🆕 新建 / 🛠 处理中 / ✅ 已修复 / 🚫 无效 |\n\n## 环境信息\n\n- **系统**：Windows 11 / macOS 14 / ...\n- **浏览器**：Chrome 120\n- **版本**：v1.0.0\n- **账号 / 数据**：\n\n## 问题描述\n\n> 简洁说明现象。\n\n## 复现步骤\n\n1. 打开 xxx 页面\n2. 点击 xxx 按钮\n3. 输入 xxx\n4. 观察到 xxx\n\n## 预期结果\n\n\n\n## 实际结果\n\n\n\n## 截图 / 录屏\n\n> 附上证据\n\n## 日志 / 错误信息\n\n\`\`\`\n[粘贴日志]\n\`\`\`\n\n## 影响范围\n\n- 受影响用户：\n- 是否有 workaround：\n\n## 修复方案（研发填写）\n\n- 根因分析：\n- 修复方式：\n- 回归范围：\n` }
  ]

  let templates = []
  let selectedId = null
  let applyCallback = null

  async function load() {
    const saved = await window.api.storeGet('tpl_v2')
    const builtinIds = new Set(BUILTIN_DEFAULTS.map(d => d.id))
    if (saved && saved.length > 0) {
      // 剔除已不在 BUILTIN_DEFAULTS 中的旧内置模板（用户自定义的 builtin=false 保留）
      templates = saved.filter(t => !t.builtin || builtinIds.has(t.id))
      // 补齐缺失的新内置模板
      let changed = templates.length !== saved.length
      BUILTIN_DEFAULTS.forEach(def => {
        if (!templates.some(t => t.id === def.id)) {
          templates.push({
            id: def.id, name: def.name, icon: def.icon, builtin: true,
            content: typeof def.content === 'string' ? def.content : ''
          })
          changed = true
        }
      })
      if (changed) await persist()
    } else {
      templates = BUILTIN_DEFAULTS.map(t => ({
        id: t.id, name: t.name, icon: t.icon, builtin: true,
        content: typeof t.content === 'string' ? t.content : ''
      }))
      await persist()
    }
  }

  async function persist() {
    await window.api.storeSet('tpl_v2', templates)
  }

  function resolveContent(tpl) {
    if (!tpl.builtin) return tpl.content
    const def = BUILTIN_DEFAULTS.find(b => b.id === tpl.id)
    if (!def) return tpl.content
    return typeof def.content === 'function' ? def.content() : def.content
  }

  // ── 拖拽状态 ───────────────────────────────────────────────
  let dragSrcId = null

  // ── 渲染列表（含拖拽绑定） ─────────────────────────────────
  function renderList() {
    const list = document.getElementById('tpl-list')
    list.innerHTML = ''
    templates.forEach(t => {
      const el = document.createElement('div')
      el.className = 'tpl-item' + (t.id === selectedId ? ' active' : '')
      el.dataset.id = t.id
      el.draggable = true
      el.innerHTML = `
        <span class="tpl-drag-handle" title="拖拽排序">⠿</span>
        <span class="tpl-item-icon">${t.icon || '📄'}</span>
        <span class="tpl-item-name">${t.name}</span>
        <span class="tpl-item-tag">${t.builtin ? '内置' : '自定义'}</span>
      `
      el.addEventListener('click', () => select(t.id))

      // 拖拽事件
      el.addEventListener('dragstart', e => {
        dragSrcId = t.id
        e.dataTransfer.effectAllowed = 'move'
        el.classList.add('dragging')
      })
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging')
        document.querySelectorAll('.tpl-item').forEach(i => i.classList.remove('drag-over'))
      })
      el.addEventListener('dragover', e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        document.querySelectorAll('.tpl-item').forEach(i => i.classList.remove('drag-over'))
        if (t.id !== dragSrcId) el.classList.add('drag-over')
      })
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
      el.addEventListener('drop', async e => {
        e.preventDefault()
        el.classList.remove('drag-over')
        if (!dragSrcId || dragSrcId === t.id) return
        const fromIdx = templates.findIndex(x => x.id === dragSrcId)
        const toIdx   = templates.findIndex(x => x.id === t.id)
        if (fromIdx < 0 || toIdx < 0) return
        const [moved] = templates.splice(fromIdx, 1)
        templates.splice(toIdx, 0, moved)
        await persist()
        renderList()
      })

      list.appendChild(el)
    })
  }

  function select(id) {
    selectedId = id
    renderList()
    const t = templates.find(t => t.id === id)
    if (!t) return
    document.getElementById('tpl-icon').value = t.icon || ''
    document.getElementById('tpl-name').value = t.name
    document.getElementById('tpl-content').value = t.content
    document.getElementById('tpl-btn-delete').style.display = ''
    document.getElementById('tpl-btn-apply').style.display = ''
  }

  function startNew() {
    selectedId = null
    renderList()
    document.getElementById('tpl-icon').value = '📋'
    document.getElementById('tpl-name').value = ''
    document.getElementById('tpl-content').value = ''
    document.getElementById('tpl-btn-delete').style.display = 'none'
    document.getElementById('tpl-btn-apply').style.display = 'none'
    document.getElementById('tpl-name').focus()
  }

  async function save() {
    const icon    = document.getElementById('tpl-icon').value.trim() || '📋'
    const name    = document.getElementById('tpl-name').value.trim()
    const content = document.getElementById('tpl-content').value
    if (!name) { ExportManager.showToast('请输入模板名称'); return }
    if (selectedId) {
      const t = templates.find(t => t.id === selectedId)
      if (t) { t.icon = icon; t.name = name; t.content = content }
    } else {
      const id = 'u_' + Date.now()
      templates.push({ id, name, icon, content, builtin: false })
      selectedId = id
    }
    await persist()
    renderList()
    select(selectedId)
    ExportManager.showToast('模板已保存')
  }

  async function del() {
    if (!selectedId) return
    const t = templates.find(t => t.id === selectedId)
    if (!t || !confirm(`确定删除「${t.name}」吗？`)) return
    templates = templates.filter(t => t.id !== selectedId)
    await persist()
    selectedId = templates.length > 0 ? templates[0].id : null
    renderList()
    if (selectedId) select(selectedId)
    else startNew()
    ExportManager.showToast('已删除')
  }

  // ── 应用：焦点修复核心 ─────────────────────────────────────
  async function apply() {
    const t = templates.find(t => t.id === selectedId)
    if (!t) return

    const content = resolveContent(t)

    // Step 1: 主动 blur 掉 modal 内的当前焦点元素
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur()
    }

    // Step 2: 关闭 overlay（CSS 中 visibility 会在 open 移除时立即变 hidden
    // 并移出焦点树，避免残留元素抢焦点）
    const overlay = document.getElementById('tpl-overlay')
    overlay.classList.remove('open')

    // Step 3: 应用内容
    if (applyCallback) applyCallback(content, t.name)

    // Step 4: 等主进程完成 blur+focus 后再把焦点交给 CM
    // 关键：必须 await，否则主进程的 webContents.focus() 会覆盖掉渲染进程的 cm.focus()
    if (window.api && window.api.focusWindow) {
      await window.api.focusWindow()
    }
    EditorManager.focus()
    // 再做一次 RAF 保险，覆盖 Chromium 异步 blur
    requestAnimationFrame(() => EditorManager.focus())

    ExportManager.showToast(`已应用：${t.name}`)
  }

  async function open() {
    await load()
    renderList()
    if (!selectedId && templates.length > 0) selectedId = templates[0].id
    if (selectedId) select(selectedId)
    else startNew()
    document.getElementById('tpl-overlay').classList.add('open')
  }

  function close() {
    document.getElementById('tpl-overlay').classList.remove('open')
  }

  function init() {
    document.getElementById('tpl-close').addEventListener('click', close)
    document.getElementById('tpl-btn-add').addEventListener('click', startNew)
    document.getElementById('tpl-btn-save').addEventListener('click', save)
    document.getElementById('tpl-btn-delete').addEventListener('click', del)

    // mousedown preventDefault：阻止按钮在 mousedown 时抢走 OS 焦点
    // 这样 click 触发时，焦点还在 modal 内（而不是在按钮上），
    // apply() 里的 textarea.focus() 是第一次焦点转移，Windows 能正确处理
    const applyBtn = document.getElementById('tpl-btn-apply')
    applyBtn.addEventListener('mousedown', e => e.preventDefault())
    applyBtn.addEventListener('click', apply)

    document.getElementById('tpl-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) close()
    })
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('tpl-overlay').classList.contains('open')) close()
    })
  }

  function onApply(cb) { applyCallback = cb }

  return { init, open, close, onApply }
})()
