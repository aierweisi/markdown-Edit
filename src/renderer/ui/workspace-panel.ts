import type { AppContext } from '../context'
import type { DirEntry } from '@shared/types'
import { MD_EXTENSIONS } from '@shared/paths'
import { showConfirm } from './confirm-modal'
import { showToast } from './toast'

export interface WorkspacePanelApi {
  open(): Promise<void>
  restore(): Promise<void>
  refresh(): Promise<void>
  toggle(): void
  isVisible(): boolean
  markActive(filePath: string | null): void
}

interface WorkspaceDeps {
  ctx: AppContext
  onOpenFile(path: string): void
}

/** File-tree sidebar over an opened folder (lazy-loaded, with CRUD). */
export function createWorkspacePanel(deps: WorkspaceDeps): WorkspacePanelApi {
  let root: string | null = null
  let activePath: string | null = null
  const expanded = new Set<string>()

  const $sidebar = (): HTMLElement | null => document.getElementById('sidebar')
  const $tree = (): HTMLElement | null => document.getElementById('file-tree')

  // ── rendering ────────────────────────────────────────────────
  async function loadDir(dir: string, container: HTMLElement): Promise<void> {
    const res = await deps.ctx.api.workspaceList(dir)
    if (!res.success) {
      container.innerHTML = `<div class="workspace-empty">读取失败:${escapeHtml(res.error)}</div>`
      return
    }
    container.innerHTML = ''
    if (res.entries.length === 0) {
      container.innerHTML = '<div class="workspace-empty">（空文件夹）</div>'
      return
    }
    for (const e of res.entries) container.appendChild(renderRow(e))
  }

  function renderRow(entry: DirEntry): HTMLElement {
    const row = document.createElement('div')
    row.className = 'tree-row' + (entry.isDir ? ' is-dir' : ' is-file')
    if (!entry.isDir && entry.path === activePath) row.classList.add('active')
    row.dataset.path = entry.path
    row.dataset.isDir = String(entry.isDir)

    const icon = document.createElement('span')
    icon.className = 'tree-icon'
    icon.textContent = entry.isDir ? '▸' : '•'
    const name = document.createElement('span')
    name.className = 'tree-name'
    name.textContent = entry.name
    row.append(icon, name)

    if (entry.isDir) {
      const kids = document.createElement('div')
      kids.className = 'tree-children'
      kids.hidden = true
      row.append(kids)
      row.addEventListener('click', (e) => {
        e.stopPropagation()
        void toggleDir(entry, icon, kids)
      })
    } else {
      row.addEventListener('click', (e) => {
        e.stopPropagation()
        activePath = entry.path
        deps.onOpenFile(entry.path)
        refreshActive()
      })
    }
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      openNodeMenu(e, entry)
    })
    return row
  }

  async function toggleDir(entry: DirEntry, icon: HTMLElement, kids: HTMLElement): Promise<void> {
    if (expanded.has(entry.path)) {
      expanded.delete(entry.path)
      icon.textContent = '▸'
      kids.hidden = true
    } else {
      expanded.add(entry.path)
      icon.textContent = '▾'
      kids.hidden = false
      if (kids.childElementCount === 0) await loadDir(entry.path, kids)
    }
  }

  function refreshActive(): void {
    $tree()?.querySelectorAll('.tree-row.active').forEach((el) => el.classList.remove('active'))
    if (!activePath) return
    $tree()?.querySelectorAll<HTMLElement>('.tree-row').forEach((el) => {
      if (el.dataset.isDir === 'false' && el.dataset.path === activePath) el.classList.add('active')
    })
  }

  // ── context menu ─────────────────────────────────────────────
  let menuEl: HTMLElement | null = null
  function openNodeMenu(evt: MouseEvent, entry: DirEntry): void {
    closeNodeMenu()
    const items: Array<{ label: string; danger?: boolean; run: () => void }> = []
    if (entry.isDir) {
      items.push({ label: '在此新建文件', run: () => void promptCreate(entry.path, false) })
      items.push({ label: '在此新建文件夹', run: () => void promptCreate(entry.path, true) })
    }
    items.push({ label: '重命名', run: () => void promptRename(entry) })
    items.push({ label: '删除', danger: true, run: () => void doDelete(entry) })

    menuEl = document.createElement('div')
    menuEl.className = 'context-menu'
    for (const it of items) {
      const b = document.createElement('div')
      b.className = 'context-menu-item' + (it.danger ? ' is-danger' : '')
      b.textContent = it.label
      b.addEventListener('click', () => {
        closeNodeMenu()
        it.run()
      })
      menuEl.appendChild(b)
    }
    menuEl.style.left = `${Math.min(evt.clientX, window.innerWidth - 180)}px`
    menuEl.style.top = `${evt.clientY}px`
    document.body.appendChild(menuEl)
    setTimeout(() => document.addEventListener('mousedown', closeNodeMenu, { once: true }), 0)
  }
  function closeNodeMenu(): void {
    menuEl?.remove()
    menuEl = null
  }

  // ── CRUD ─────────────────────────────────────────────────────
  async function promptCreate(parentDir: string, isDir: boolean): Promise<void> {
    const name = await promptText(isDir ? '新建文件夹' : '新建文件', isDir ? '文件夹名' : '文件名（.md）')
    if (!name) return
    const finalName = isDir ? name : ensureMdExt(name)
    const full = joinPath(parentDir, finalName)
    const res = await deps.ctx.api.fileCreate(full, isDir)
    if (!res.success) {
      showToast(`创建失败: ${res.error}`, 'error')
      return
    }
    await refresh()
    if (!isDir) deps.onOpenFile(full)
  }

  async function promptRename(entry: DirEntry): Promise<void> {
    const name = await promptText('重命名', entry.name, entry.name)
    if (!name || name === entry.name) return
    const dir = parentDirOf(entry.path)
    const res = await deps.ctx.api.fileRename(entry.path, joinPath(dir, name))
    if (!res.success) {
      showToast(`重命名失败: ${res.error}`, 'error')
      return
    }
    await refresh()
  }

  async function doDelete(entry: DirEntry): Promise<void> {
    const ok = await showConfirm({
      title: '删除',
      message: `确定删除「${entry.name}」?${entry.isDir ? ' 文件夹内所有内容将被删除。' : ''}`,
      okText: '删除',
      danger: true,
    })
    if (!ok) return
    const res = await deps.ctx.api.fileDelete(entry.path, entry.isDir)
    if (!res.success) {
      showToast(`删除失败: ${res.error}`, 'error')
      return
    }
    showToast('已删除', 'success')
    await refresh()
  }

  // ── text-input modal ─────────────────────────────────────────
  function promptText(title: string, placeholder: string, initial = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'modal-overlay open'
      overlay.innerHTML = `
        <div class="modal modal-small" style="width: 340px">
          <div class="modal-header"><h2>${escapeHtml(title)}</h2></div>
          <div class="modal-body"><input type="text" class="workspace-prompt-input" placeholder="${escapeHtml(placeholder)}" /></div>
          <div class="modal-actions" style="justify-content: flex-end">
            <button class="btn-secondary" data-act="cancel">取消</button>
            <button class="btn-primary" data-act="ok">确定</button>
          </div>
        </div>`
      document.body.appendChild(overlay)
      const input = overlay.querySelector<HTMLInputElement>('.workspace-prompt-input')!
      input.value = initial
      input.focus()
      input.select()
      const finish = (val: string | null): void => {
        overlay.remove()
        document.removeEventListener('keydown', onKey)
        resolve(val)
      }
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(input.value.trim() || null)
        } else if (e.key === 'Escape') finish(null)
      }
      input.addEventListener('keydown', onKey)
      overlay.querySelector('[data-act="ok"]')!.addEventListener('click', () => finish(input.value.trim() || null))
      overlay.querySelector('[data-act="cancel"]')!.addEventListener('click', () => finish(null))
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) finish(null)
      })
    })
  }

  // ── panel ops ────────────────────────────────────────────────
  async function renderRoot(): Promise<void> {
    if (!root) return
    const t = $tree()
    if (!t) return
    t.innerHTML = ''
    await loadDir(root, t)
  }

  async function refresh(): Promise<void> {
    expanded.clear()
    await renderRoot()
  }

  async function open(): Promise<void> {
    const res = await deps.ctx.api.dialogSelectDir()
    if (res.canceled || !res.filePaths.length) return
    root = res.filePaths[0]
    await deps.ctx.api.storeSet('workspacePath', root)
    expanded.clear()
    setTitle(root)
    show()
    await renderRoot()
  }

  async function restore(): Promise<void> {
    const stored = await deps.ctx.api.storeGet('workspacePath')
    if (!stored) return
    root = stored
    setTitle(root)
    show()
    await renderRoot()
  }

  function show(): void {
    $sidebar()?.classList.add('open')
  }
  function setTitle(path: string): void {
    const el = document.querySelector('.sidebar-title')
    if (el) el.textContent = basename(path)
  }
  function toggle(): void {
    $sidebar()?.classList.toggle('open')
  }
  function isVisible(): boolean {
    return $sidebar()?.classList.contains('open') ?? false
  }
  function markActive(filePath: string | null): void {
    activePath = filePath
    refreshActive()
  }

  // header buttons
  document.getElementById('ws-newfile')?.addEventListener('click', () => {
    if (root) void promptCreate(root, false)
  })
  document.getElementById('ws-newdir')?.addEventListener('click', () => {
    if (root) void promptCreate(root, true)
  })
  document.getElementById('ws-refresh')?.addEventListener('click', () => void refresh())
  document.getElementById('ws-close')?.addEventListener('click', () => $sidebar()?.classList.remove('open'))

  return { open, restore, refresh, toggle, isVisible, markActive }
}

function joinPath(dir: string, name: string): string {
  return dir.replace(/[\\/]+$/, '') + '/' + name
}
function parentDirOf(full: string): string {
  const i = Math.max(full.lastIndexOf('/'), full.lastIndexOf('\\'))
  return i > 0 ? full.slice(0, i) : full
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}
function basename(p: string): string {
  const clean = p.replace(/[\\/]+$/, '')
  const i = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return i >= 0 ? clean.slice(i + 1) : clean
}
/** Ensure a file name ends with a markdown extension; add `.md` if it doesn't. */
function ensureMdExt(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot > 0) {
    const ext = name.slice(dot + 1).toLowerCase()
    if ((MD_EXTENSIONS as readonly string[]).includes(ext)) return name
  }
  return name + '.md'
}
