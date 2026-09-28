import type { AppContext } from '../context'
import type { SearchHit } from '@shared/types'
import { escHtml } from '../lib/fs-paths'

export interface SearchPanelApi {
  /** Run a search and render the results (empty query renders the hint). */
  search(query: string): Promise<void>
  /** Focus + select the query input. */
  focus(): void
}

interface SearchDeps {
  ctx: AppContext
  /** Open the hit's file and put the cursor on its line. */
  onOpenHit(path: string, line: number): void
}

const INPUT_DEBOUNCE_MS = 300
const MAX_FILE_GROUPS = 50

/**
 * Workspace full-text search view (sidebar). The main process walks the
 * workspace (async, md files only) and returns per-line hits; this panel
 * groups them by file and jumps to the line on click.
 */
export function createSearchPanel(deps: SearchDeps): SearchPanelApi {
  const input = document.getElementById('sp-input') as HTMLInputElement | null
  const results = document.getElementById('sp-results')

  let token = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function setSearching(on: boolean): void {
    document.querySelector('.sidebar-view--search .sidebar-search')?.classList.toggle('searching', on)
  }

  function renderEmpty(html: string): void {
    if (results) results.innerHTML = `<div class="sp-empty">${html}</div>`
  }

  /** Escape `text` and wrap the first case-insensitive occurrence of `query`
   *  in <mark>. Slicing raw text (not the escaped string) keeps offsets sane. */
  function highlight(text: string, query: string): string {
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx < 0) return escHtml(text)
    return (
      escHtml(text.slice(0, idx)) +
      `<mark>${escHtml(text.slice(idx, idx + query.length))}</mark>` +
      escHtml(text.slice(idx + query.length))
    )
  }

  async function search(queryRaw: string): Promise<void> {
    const query = queryRaw.trim()
    if (!results) return
    if (!query) {
      renderEmpty('输入关键词，搜索工作区内所有 Markdown 文件的内容')
      return
    }
    const myToken = ++token
    setSearching(true)
    let res: Awaited<ReturnType<typeof deps.ctx.api.workspaceSearch>>
    try {
      res = await deps.ctx.api.workspaceSearch(query)
    } catch {
      setSearching(false)
      renderEmpty('搜索失败')
      return
    }
    setSearching(false)
    if (myToken !== token) return // a newer query superseded this result

    if (!res.success) {
      renderEmpty(res.error === 'no workspace' ? '请先打开工作区 (Ctrl+Shift+E)' : escHtml(res.error))
      return
    }
    if (res.hits.length === 0) {
      renderEmpty(`没有找到包含 “${escHtml(query)}” 的内容`)
      return
    }

    // Group hits by file, preserving arrival order; cap the file count so a
    // needle matching everything stays renderable.
    const groups = new Map<string, SearchHit[]>()
    let filesCapped = false
    for (const h of res.hits) {
      const g = groups.get(h.path)
      if (g) {
        g.push(h)
      } else if (groups.size < MAX_FILE_GROUPS) {
        groups.set(h.path, [h])
      } else {
        filesCapped = true
      }
    }

    results.innerHTML = ''
    for (const [path, hits] of groups) {
      const file = document.createElement('div')
      file.className = 'sp-file'
      const name = document.createElement('div')
      name.className = 'sp-file-name'
      name.textContent = `${baseName(path)}（${hits.length}）`
      name.title = path
      file.append(name)
      for (const h of hits) {
        const row = document.createElement('button')
        row.type = 'button'
        row.className = 'sp-hit'
        row.title = `${path}:${h.line}`
        row.innerHTML =
          `<span class="sp-hit-line">${h.line}</span>` +
          `<span class="sp-hit-text">${highlight(h.text, query)}</span>`
        row.addEventListener('click', () => deps.onOpenHit(h.path, h.line))
        file.append(row)
      }
      results.append(file)
    }
    if (res.truncated || filesCapped) {
      const t = document.createElement('div')
      t.className = 'sp-empty'
      t.textContent = '结果过多，仅显示部分匹配'
      results.append(t)
    }
  }

  // Initial hint so the view never opens blank.
  renderEmpty('输入关键词，搜索工作区内所有 Markdown 文件的内容')

  input?.addEventListener('input', () => {
    if (timer) clearTimeout(timer)
    const val = input.value
    timer = setTimeout(() => void search(val), INPUT_DEBOUNCE_MS)
  })
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (timer) clearTimeout(timer)
      void search(input.value)
    }
  })

  return {
    search,
    focus() {
      input?.focus()
      input?.select()
    },
  }
}

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}
