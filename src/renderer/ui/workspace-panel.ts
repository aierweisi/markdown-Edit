import type { AppContext } from '../context'
import type { DirEntry } from '@shared/types'
import { MD_EXTENSIONS } from '@shared/paths'
import { showConfirm } from './confirm-modal'
import { showToast } from './toast'

export interface WorkspacePanelApi {
  /** Prompt for a workspace folder. Returns true if one was chosen. */
  open(): Promise<boolean>
  /** Load the persisted folder + width and render the root tree (no visibility side effects). */
  restore(): Promise<void>
  refresh(): Promise<void>
  markActive(filePath: string | null): void
  /** Ensure the root tree is rendered and reveal the active file (host-open content). */
  reveal(): Promise<void>
  /** Expand ancestors of the active file and scroll it into view (no rerender). */
  revealActiveFile(): Promise<void>
  hasRoot(): boolean
}

interface WorkspaceDeps {
  ctx: AppContext
  onOpenFile(path: string): void
  /** Called after a drag-move so open tabs can retarget to the new path. */
  onFileMoved?(oldPath: string, newPath: string): void
  /** Called after the user picks a new workspace folder, so the host controller
   *  can switch to (and open) the workspace view. */
  onFolderOpened?(): void
}

/** File-tree sidebar over an opened folder (lazy-loaded, with CRUD). */
export function createWorkspacePanel(deps: WorkspaceDeps): WorkspacePanelApi {
  let root: string | null = null
  let activePath: string | null = null
  const expanded = new Set<string>()
  // Drag-and-drop move source row.
  let dragSrc: DirEntry | null = null

  const $host = (): HTMLElement | null => document.getElementById('sidebar-host')
  const $tree = (): HTMLElement | null => document.getElementById('file-tree')

  // ── width (resizable sidebar) ─────────────────────────────────
  let curWidth = WS_WIDTH_DEFAULT
  let widthPersistTimer: ReturnType<typeof setTimeout> | null = null
  function applyWidth(px: number): void {
    document.documentElement.style.setProperty('--workspace-w', `${Math.round(px)}px`)
  }
  function clampWidth(px: number): number {
    const max = Math.min(WS_WIDTH_MAX, window.innerWidth - 200)
    return Math.max(WS_WIDTH_MIN, Math.min(max, px))
  }
  function persistWidth(): void {
    if (widthPersistTimer) clearTimeout(widthPersistTimer)
    widthPersistTimer = setTimeout(() => {
      void deps.ctx.api.storeSet('workspaceWidth', curWidth)
    }, 400)
  }

  // ── filter ───────────────────────────────────────────────────
  let fullyLoaded = false
  let filterTimer: ReturnType<typeof setTimeout> | null = null
  let filterToken = 0
  let revealToken = 0
  function setSearching(on: boolean): void {
    document.querySelector('.sidebar-search')?.classList.toggle('searching', on)
  }

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
    const isExpandedDir = entry.isDir && expanded.has(entry.path)
    row.className = 'tree-row' + (entry.isDir ? ' is-dir' : ' is-file') + (isExpandedDir ? ' expanded' : '')
    if (!entry.isDir && entry.path === activePath) row.classList.add('active')
    row.dataset.path = entry.path
    row.dataset.isDir = String(entry.isDir)
    row.draggable = true

    const label = document.createElement('div')
    label.className = 'tree-label'
    const icon = document.createElement('span')
    icon.className = 'tree-icon'
    icon.innerHTML = entry.isDir ? ICON_DIR : ICON_FILE
    const name = document.createElement('span')
    name.className = 'tree-name'
    name.textContent = entry.name
    label.append(icon, name)
    row.append(label)

    if (entry.isDir) {
      const kids = document.createElement('div')
      kids.className = 'tree-children'
      kids.hidden = !isExpandedDir
      row.append(kids)
      label.addEventListener('click', (e) => {
        e.stopPropagation()
        void toggleDir(entry, row, kids)
      })
      // Accept dropped rows to move them INTO this directory.
      row.addEventListener('dragover', (e) => {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        row.classList.add('drag-over')
      })
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'))
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        e.stopPropagation()
        row.classList.remove('drag-over')
        void moveEntry(dragSrc, entry)
      })
    } else {
      label.addEventListener('click', (e) => {
        e.stopPropagation()
        activePath = entry.path
        deps.onOpenFile(entry.path)
        refreshActive()
      })
    }
    row.addEventListener('dragstart', (e) => {
      dragSrc = entry
      row.classList.add('dragging')
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        // Plain text payload (NOT 'Files') so the editor's external-file drop
        // handler ignores this internal move.
        e.dataTransfer.setData('text/plain', entry.path)
      }
    })
    row.addEventListener('dragend', () => {
      dragSrc = null
      row.classList.remove('dragging')
      $tree()?.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
    })
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      // Stop the event bubbling into an ancestor directory row, which would
      // otherwise close this menu and rebuild it for the parent — surfacing the
      // parent's entry (so "new file here" / rename / delete would hit the
      // parent, not the right-clicked node).
      e.stopPropagation()
      openNodeMenu(e, entry)
    })
    return row
  }

  async function toggleDir(entry: DirEntry, row: HTMLElement, kids: HTMLElement): Promise<void> {
    if (expanded.has(entry.path)) {
      expanded.delete(entry.path)
      row.classList.remove('expanded')
      kids.hidden = true
    } else {
      expanded.add(entry.path)
      row.classList.add('expanded')
      kids.hidden = false
      if (kids.childElementCount === 0) await loadDir(entry.path, kids)
    }
  }

  function refreshActive(): void {
    $tree()?.querySelectorAll('.tree-row.active').forEach((el) => el.classList.remove('active'))
    if (!activePath) return
    findFileRow(activePath)?.classList.add('active')
  }

  // ── auto-reveal the active file (expand ancestors + scroll into view) ──
  function findDirRow(dirPath: string): HTMLElement | null {
    const norm = normPath(dirPath)
    let found: HTMLElement | null = null
    $tree()?.querySelectorAll<HTMLElement>('.tree-row.is-dir').forEach((r) => {
      if (!found && normPath(r.dataset.path ?? '') === norm) found = r
    })
    return found
  }
  function findFileRow(filePath: string): HTMLElement | null {
    const norm = normPath(filePath)
    let found: HTMLElement | null = null
    $tree()?.querySelectorAll<HTMLElement>('.tree-row.is-file').forEach((r) => {
      if (!found && normPath(r.dataset.path ?? '') === norm) found = r
    })
    return found
  }
  /** Remove filter-hidden from a row and all its ancestor rows so it stays visible. */
  function unhideChain(row: HTMLElement): void {
    let cur: HTMLElement | null = row
    while (cur && cur.classList.contains('tree-row')) {
      cur.classList.remove('filter-hidden')
      // Climb: row → its .tree-children/#file-tree container → the ancestor row.
      cur = cur.parentElement?.parentElement ?? null
    }
  }
  /** Ensure a dir row is expanded and its children loaded. No-op if not found. */
  async function expandDir(dirPath: string): Promise<void> {
    const row = findDirRow(dirPath)
    if (!row) return
    const origPath = row.dataset.path ?? dirPath
    const kids = row.querySelector<HTMLElement>(':scope > .tree-children')
    if (!kids) return
    if (!expanded.has(origPath)) {
      expanded.add(origPath)
      row.classList.add('expanded')
      kids.hidden = false
      if (kids.childElementCount === 0) await loadDir(origPath, kids)
    }
  }
  /** Expand ancestor dirs of `filePath` (loading if needed), then scroll it into view. */
  async function revealActive(filePath: string): Promise<void> {
    if (!root) return
    const rootNorm = normPath(root)
    const fileNorm = normPath(filePath)
    if (fileNorm === rootNorm || !fileNorm.startsWith(rootNorm + '/')) return
    const token = ++revealToken
    const rel = fileNorm.slice(rootNorm.length + 1)
    const parts = rel.split('/')
    parts.pop() // drop the filename → ancestor dir chain
    let cur = rootNorm
    for (const part of parts) {
      if (!part) continue
      cur = cur + '/' + part
      await expandDir(cur)
      if (token !== revealToken) return // a newer reveal superseded this
    }
    if (token !== revealToken) return
    const target = findFileRow(filePath)
    if (target) {
      unhideChain(target)
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }
  /** Render the root tree if empty, then reveal the active file. */
  async function expandAndReveal(): Promise<void> {
    if ($tree()?.childElementCount === 0) await renderRoot()
    if (activePath) await revealActive(activePath)
  }

  // ── context menu ─────────────────────────────────────────────
  let menuEl: HTMLElement | null = null
  let menuOutsideDown: ((e: MouseEvent) => void) | null = null
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
    // Close on an outside mousedown — but ignore ones that land INSIDE the menu.
    // A click fires only after mousedown; if the outside-handler removed the
    // menu on the item's own mousedown, the click (and thus the action) would
    // never run, leaving 重命名/删除 dead.
    menuOutsideDown = (e: MouseEvent): void => {
      if (menuEl && !menuEl.contains(e.target as Node)) closeNodeMenu()
    }
    setTimeout(() => {
      if (menuOutsideDown) document.addEventListener('mousedown', menuOutsideDown)
    }, 0)
  }
  function closeNodeMenu(): void {
    if (menuOutsideDown) {
      document.removeEventListener('mousedown', menuOutsideDown)
      menuOutsideDown = null
    }
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

  // ── drag-and-drop move ──────────────────────────────────────
  async function moveEntry(src: DirEntry | null, destDir: DirEntry): Promise<void> {
    if (!src || !root) return
    const srcN = normPath(src.path)
    const destN = normPath(destDir.path)
    if (destN === srcN) return // dropped onto itself
    // Cannot move a folder into itself or any of its descendants.
    if (src.isDir && destN.startsWith(srcN + '/')) {
      showToast('不能移动到自身或其子文件夹内', 'error')
      return
    }
    const newPath = joinPath(destDir.path, basename(src.path))
    if (normPath(newPath) === srcN) return // already inside the destination
    const res = await deps.ctx.api.fileRename(src.path, newPath)
    if (!res.success) {
      const msg = res.error === 'target exists' ? '目标已存在同名项' : res.error
      showToast(`移动失败: ${msg}`, 'error')
      return
    }
    await refresh()
    deps.onFileMoved?.(src.path, newPath)
    // Keep activePath in sync if the active file was the moved item or lived
    // inside a moved folder, so the tree highlight stays correct afterwards.
    if (activePath) {
      const aN = normPath(activePath)
      const sN = normPath(src.path)
      if (aN === sN) activePath = newPath
      else if (aN.startsWith(sN + '/')) activePath = normPath(newPath) + aN.slice(sN.length)
    }
    showToast('已移动', 'success')
  }

  // ── text-input modal ─────────────────────────────────────────
  function promptText(title: string, placeholder: string, initial = ''): Promise<string | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div')
      overlay.className = 'modal-overlay open'
      overlay.innerHTML = `
        <div class="modal modal-small" style="width: 340px">
          <div class="modal-header"><h2>${escapeHtml(title)}</h2></div>
          <div class="modal-body">
            <input type="text" class="workspace-prompt-input" placeholder="${escapeHtml(placeholder)}" />
            <div class="modal-actions">
              <button class="btn-secondary" data-act="cancel">取消</button>
              <button class="btn-primary" data-act="ok">确定</button>
            </div>
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
    const t = $tree()
    if (!t) return
    if (!root) {
      t.innerHTML =
        '<div class="workspace-empty workspace-empty--action">未打开工作区<br>点击此处选择文件夹</div>'
      t.querySelector('.workspace-empty')?.addEventListener('click', () => void open())
      return
    }
    t.innerHTML = ''
    await loadDir(root, t)
  }

  async function refresh(): Promise<void> {
    fullyLoaded = false
    await renderRoot()
    const tree = $tree()
    if (tree) await restoreExpanded(tree)
    const f = document.getElementById('ws-filter') as HTMLInputElement | null
    if (f && f.value.trim()) await runFilter(f.value)
  }

  // ── name filter ───────────────────────────────────────────────
  /** Recursively populate every dir's children without changing expand state. */
  async function loadAll(container: HTMLElement): Promise<void> {
    const dirs = container.querySelectorAll<HTMLElement>(':scope > .tree-row.is-dir')
    for (const d of dirs) {
      const kids = d.querySelector<HTMLElement>(':scope > .tree-children')
      if (!kids) continue
      const dp = d.dataset.path ?? ''
      if (kids.childElementCount === 0) await loadDir(dp, kids)
      await loadAll(kids)
    }
  }
  /** After a re-render, repopulate every dir the user had expanded — preserving
   *  expand state across refresh / delete / rename / create. renderRow already
   *  flagged expanded dirs (class + unhidden kids); here we fill those kids and
   *  recurse, mirroring loadAll but scoped to previously-expanded dirs only. */
  async function restoreExpanded(container: HTMLElement): Promise<void> {
    const dirs = Array.from(container.querySelectorAll<HTMLElement>(':scope > .tree-row.is-dir'))
    await Promise.all(
      dirs
        .filter((d) => expanded.has(d.dataset.path ?? ''))
        .map(async (d) => {
          const kids = d.querySelector<HTMLElement>(':scope > .tree-children')
          if (!kids) return
          if (kids.childElementCount === 0) await loadDir(d.dataset.path ?? '', kids)
          await restoreExpanded(kids)
        }),
    )
  }
  /** Hide non-matching rows; expand dirs that contain matches. Returns whether
   *  this subtree contains any matching file. */
  function hideNonMatches(container: HTMLElement, q: string): boolean {
    let anyMatch = false
    const rows = container.querySelectorAll<HTMLElement>(':scope > .tree-row')
    for (const r of rows) {
      const name = (r.querySelector('.tree-name')?.textContent ?? '').toLowerCase()
      if (r.dataset.isDir === 'true') {
        const kids = r.querySelector<HTMLElement>(':scope > .tree-children')
        const subMatch = kids ? hideNonMatches(kids, q) : false
        const show = subMatch || name.includes(q)
        r.classList.toggle('filter-hidden', !show)
        if (subMatch) {
          expanded.add(r.dataset.path ?? '')
          r.classList.add('expanded')
          if (kids) kids.hidden = false
        }
        if (show) anyMatch = true
      } else {
        const show = name.includes(q)
        r.classList.toggle('filter-hidden', !show)
        if (show) anyMatch = true
      }
    }
    return anyMatch
  }
  async function runFilter(qRaw: string): Promise<void> {
    const q = qRaw.trim().toLowerCase()
    const tree = $tree()
    if (!tree) return
    if (!q) {
      setSearching(false)
      tree.querySelectorAll('.tree-row').forEach((r) => r.classList.remove('filter-hidden'))
      return
    }
    const token = ++filterToken
    if (!fullyLoaded) {
      setSearching(true)
      await loadAll(tree)
      setSearching(false)
      if (token !== filterToken) return // a newer filter superseded this
      fullyLoaded = true
    }
    if (token !== filterToken) return
    hideNonMatches(tree, q)
  }

  async function open(): Promise<boolean> {
    const res = await deps.ctx.api.dialogSelectDir()
    if (res.canceled || !res.filePaths.length) return false
    root = res.filePaths[0]
    await deps.ctx.api.storeSet('workspacePath', root)
    expanded.clear()
    fullyLoaded = false
    const f = document.getElementById('ws-filter') as HTMLInputElement | null
    if (f) f.value = ''
    const fc = document.getElementById('ws-filter-clear')
    if (fc) fc.hidden = true
    setTitle(root)
    await renderRoot()
    deps.onFolderOpened?.()
    return true
  }

  async function restore(): Promise<void> {
    const stored = await deps.ctx.api.storeGet('workspacePath')
    if (!stored) return
    root = stored
    setTitle(root)
    const storedWidth = await deps.ctx.api.storeGet('workspaceWidth')
    curWidth =
      typeof storedWidth === 'number' && storedWidth >= WS_WIDTH_MIN && storedWidth <= WS_WIDTH_MAX
        ? storedWidth
        : WS_WIDTH_DEFAULT
    applyWidth(curWidth)
    // Visibility (open/closed, active view) is owned by the host controller,
    // which reads sidebarOpen / sidebarActiveView. We only prime the tree.
    await renderRoot()
  }

  function setTitle(path: string): void {
    const el = document.querySelector('.sidebar-title-name')
    if (el) el.textContent = basename(path)
  }
  /** Expand ancestors of the active file and scroll it into view (no rerender). */
  async function revealActiveFile(): Promise<void> {
    if (activePath) await revealActive(activePath)
  }
  function hasRoot(): boolean {
    return root != null
  }
  function markActive(filePath: string | null): void {
    activePath = filePath
    refreshActive()
  }

  // header buttons
  document.getElementById('ws-title')?.addEventListener('click', () => void open())
  document.getElementById('ws-newfile')?.addEventListener('click', () => {
    if (root) void promptCreate(root, false)
  })
  document.getElementById('ws-newdir')?.addEventListener('click', () => {
    if (root) void promptCreate(root, true)
  })
  document.getElementById('ws-refresh')?.addEventListener('click', () => void refresh())
  // ws-close (collapse) is bound by the host controller — visibility is its concern.

  // Drop onto the tree background → move into the workspace root.
  const treeEl = $tree()
  treeEl?.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  })
  treeEl?.addEventListener('drop', (e) => {
    e.preventDefault()
    if (dragSrc && root) void moveEntry(dragSrc, { path: root, name: '', isDir: true })
  })

  // Resize the sidebar by dragging the right-edge handle.
  const resizer = document.getElementById('ws-resizer')
  resizer?.addEventListener('pointerdown', (e) => {
    if (!$host()?.classList.contains('open')) return
    e.preventDefault()
    try {
      resizer.setPointerCapture(e.pointerId)
    } catch {
      /* ignore — capture unavailable */
    }
    $host()?.classList.add('resizing')
    const onMove = (ev: PointerEvent): void => {
      curWidth = clampWidth(ev.clientX)
      applyWidth(curWidth)
    }
    const onUp = (ev: PointerEvent): void => {
      resizer.removeEventListener('pointermove', onMove)
      resizer.removeEventListener('pointerup', onUp)
      resizer.removeEventListener('pointercancel', onUp)
      try {
        resizer.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
      $host()?.classList.remove('resizing')
      void persistWidth()
    }
    resizer.addEventListener('pointermove', onMove)
    resizer.addEventListener('pointerup', onUp)
    resizer.addEventListener('pointercancel', onUp)
  })
  resizer?.addEventListener('dblclick', () => {
    curWidth = WS_WIDTH_DEFAULT
    applyWidth(curWidth)
    void persistWidth()
  })

  // Filter the tree by name as the user types (debounced); clear button resets.
  const filterInput = document.getElementById('ws-filter') as HTMLInputElement | null
  const filterClear = document.getElementById('ws-filter-clear')
  filterInput?.addEventListener('input', () => {
    const val = filterInput.value
    if (filterClear) filterClear.hidden = !val
    if (filterTimer) clearTimeout(filterTimer)
    filterTimer = setTimeout(() => void runFilter(val), 120)
  })
  filterClear?.addEventListener('click', () => {
    if (!filterInput) return
    filterInput.value = ''
    filterClear.hidden = true
    if (filterTimer) clearTimeout(filterTimer)
    void runFilter('')
  })

  return { open, restore, refresh, markActive, reveal: expandAndReveal, revealActiveFile, hasRoot }
}

// ── tree icon SVGs (stroke set via `.tree-icon svg` CSS) ───────────────
const ICON_FILE =
  '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
const ICON_CHEVRON = '<svg class="tree-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>'
const ICON_FOLDER =
  '<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
const ICON_DIR = ICON_CHEVRON + ICON_FOLDER

// ── resizable sidebar width bounds (px) ───────────────────────────────
const WS_WIDTH_MIN = 200
const WS_WIDTH_MAX = 480
const WS_WIDTH_DEFAULT = 240

function joinPath(dir: string, name: string): string {
  return dir.replace(/[\\/]+$/, '') + '/' + name
}
function parentDirOf(full: string): string {
  const i = Math.max(full.lastIndexOf('/'), full.lastIndexOf('\\'))
  return i > 0 ? full.slice(0, i) : full
}
/** Normalize a path to forward slashes with no trailing slash (for matching). */
function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
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
