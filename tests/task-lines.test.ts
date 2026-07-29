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
})
