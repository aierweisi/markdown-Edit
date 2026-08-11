import { describe, expect, it } from 'vitest'
import { createSignal } from '../src/renderer/state/signal'
import type { TabState } from '../src/renderer/state/app-store'
import type { AppContext } from '../src/renderer/context'
import { createTabManager } from '../src/renderer/tabs/tab-manager'

// tab-manager only touches store.tabs + store.activeTabId, so a minimal mock is
// enough — no need to stand up the full AppContext / DOM.
function makeCtx(): AppContext {
  const tabs = createSignal<TabState[]>([])
  const activeTabId = createSignal<string | null>(null)
  return { store: { tabs, activeTabId } } as unknown as AppContext
}

describe('createTabManager', () => {
  it('creates a tab with defaults', () => {
    const tabs = createTabManager(makeCtx())
    const t = tabs.create()
    expect(t.title).toBe('未命名')
    expect(t.filePath).toBeNull()
    expect(t.modified).toBe(false)
    expect(tabs.getContent(t.id)).toBe('')
    expect(tabs.getAll()).toHaveLength(1)
  })

  it('create honors provided content/title/filePath', () => {
    const tabs = createTabManager(makeCtx())
    const t = tabs.create({ title: 'Note', content: '# hi', filePath: '/a.md' })
    expect(t.title).toBe('Note')
    expect(t.filePath).toBe('/a.md')
    expect(tabs.getContent(t.id)).toBe('# hi')
  })

  it('setActive/getActive round-trip', () => {
    const tabs = createTabManager(makeCtx())
    const a = tabs.create({})
    const b = tabs.create({})
    tabs.setActive(b.id)
    expect(tabs.getActive()?.id).toBe(b.id)
    tabs.setActive(a.id)
    expect(tabs.getActive()?.id).toBe(a.id)
  })

  it('setContent / getContent round-trip; unknown id yields empty string', () => {
    const tabs = createTabManager(makeCtx())
    const t = tabs.create({})
    tabs.setContent(t.id, 'hello')
    expect(tabs.getContent(t.id)).toBe('hello')
    expect(tabs.getContent('does-not-exist')).toBe('')
  })

  it('markModified toggles the flag on the stored tab', () => {
    const tabs = createTabManager(makeCtx())
    const t = tabs.create({})
    expect(tabs.getById(t.id)?.modified).toBe(false)
    tabs.markModified(t.id, true)
    expect(tabs.getById(t.id)?.modified).toBe(true)
  })

  it('setTitle updates title and filePath', () => {
    const tabs = createTabManager(makeCtx())
    const t = tabs.create({})
    tabs.setTitle(t.id, 'Renamed', '/x.md')
    const got = tabs.getById(t.id)
    expect(got?.title).toBe('Renamed')
    expect(got?.filePath).toBe('/x.md')
  })

  it('close removes the tab and drops its content', () => {
    const tabs = createTabManager(makeCtx())
    const t = tabs.create({ content: 'data' })
    tabs.close(t.id)
    expect(tabs.getAll()).toHaveLength(0)
    expect(tabs.getContent(t.id)).toBe('')
  })

  it('closing the active tab promotes the last remaining tab to active', () => {
    const tabs = createTabManager(makeCtx())
    const a = tabs.create({})
    const b = tabs.create({})
    tabs.setActive(b.id)
    tabs.close(b.id)
    expect(tabs.getActive()?.id).toBe(a.id)
  })

  it('closing the last tab leaves activeTabId null', () => {
    const tabs = createTabManager(makeCtx())
    const t = tabs.create({})
    tabs.setActive(t.id)
    tabs.close(t.id)
    expect(tabs.getActive()).toBeNull()
  })

  it('reopenLast restores title/filePath/content of the most recently closed tab', () => {
    const tabs = createTabManager(makeCtx())
    const t = tabs.create({ title: 'Doc', content: 'body', filePath: '/d.md' })
    tabs.close(t.id)
    const reopened = tabs.reopenLast()
    expect(reopened).not.toBeNull()
    expect(reopened!.title).toBe('Doc')
    expect(reopened!.filePath).toBe('/d.md')
    expect(tabs.getContent(reopened!.id)).toBe('body')
  })

  it('reopenLast returns null when nothing has been closed', () => {
    const tabs = createTabManager(makeCtx())
    expect(tabs.reopenLast()).toBeNull()
  })

  it('reorder moves the dragged tab to the target position', () => {
    const tabs = createTabManager(makeCtx())
    const a = tabs.create({})
    const b = tabs.create({})
    const c = tabs.create({})
    tabs.reorder(c.id, a.id) // move c before a
    expect(tabs.getAll().map((t) => t.id)).toEqual([c.id, a.id, b.id])
  })

  it('create with a colliding id generates a fresh id instead of shadowing', () => {
    const tabs = createTabManager(makeCtx())
    const first = tabs.create({ id: 'dup', content: 'first' })
    const second = tabs.create({ id: 'dup', content: 'second' })
    expect(first.id).toBe('dup')
    expect(second.id).not.toBe('dup')
    expect(tabs.getContent(first.id)).toBe('first')
    expect(tabs.getContent(second.id)).toBe('second')
  })
})
