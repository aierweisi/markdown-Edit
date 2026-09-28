import { describe, it, expect } from 'vitest'
import { collectTaskLines, toggleTaskLine } from '../src/renderer/lib/task-lines'

describe('collectTaskLines', () => {
  it('collects task items in order with checked state and line numbers', () => {
    const doc = '- [ ] one\n- [x] two\n- not a task\n  - [ ] nested'
    const tasks = collectTaskLines(doc)
    expect(tasks).toHaveLength(3)
    expect(tasks[0]).toMatchObject({ line: 1, checked: false })
    expect(tasks[1]).toMatchObject({ line: 2, checked: true })
    expect(tasks[2]).toMatchObject({ line: 4, checked: false })
  })

  it('skips task-looking text inside fenced code blocks', () => {
    const doc = '- [ ] real\n```js\n- [ ] fake\n```\n- [x] also real'
    const tasks = collectTaskLines(doc)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].line).toBe(1)
    expect(tasks[1].line).toBe(5)
  })

  it('collects ordered-list and blockquoted task items in source order', () => {
    const doc = '- [ ] bullet\n1. [ ] ordered\n> - [x] quoted\n> > 10) [ ] nested-quote\n* not a task'
    const tasks = collectTaskLines(doc)
    expect(tasks).toHaveLength(4)
    expect(tasks[0]).toMatchObject({ line: 1, checked: false })
    expect(tasks[1]).toMatchObject({ line: 2, checked: false })
    expect(tasks[2]).toMatchObject({ line: 3, checked: true })
    expect(tasks[3]).toMatchObject({ line: 4, checked: false })
  })

  it('accepts uppercase [X] as checked and bare checkbox at end of line', () => {
    const doc = '- [X] done\n- [ ]'
    const tasks = collectTaskLines(doc)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].checked).toBe(true)
    expect(tasks[1]).toMatchObject({ checked: false, raw: '- [ ]' })
  })
})

describe('toggleTaskLine', () => {
  it('toggles unchecked to checked', () => {
    expect(toggleTaskLine('- [ ] foo')).toBe('- [x] foo')
  })

  it('toggles checked to unchecked', () => {
    expect(toggleTaskLine('- [x] foo')).toBe('- [ ] foo')
  })

  it('preserves indentation and marker', () => {
    expect(toggleTaskLine('  * [ ] foo')).toBe('  * [x] foo')
  })

  it('toggles ordered-list and blockquoted items in place', () => {
    expect(toggleTaskLine('1. [ ] foo')).toBe('1. [x] foo')
    expect(toggleTaskLine('> - [x] foo')).toBe('> - [ ] foo')
    expect(toggleTaskLine('> > 3) [ ] foo')).toBe('> > 3) [x] foo')
  })

  it('toggles uppercase [X] back to unchecked', () => {
    expect(toggleTaskLine('- [X] foo')).toBe('- [ ] foo')
  })
})
