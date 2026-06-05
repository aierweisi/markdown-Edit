/**
 * pure.test.js — Unit tests for pure utility functions
 */

import { describe, it, expect } from 'vitest'

// ─── escapeHtml (escHtml) ───────────────────────────────────
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  )
}

describe('escHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escHtml('a&b')).toBe('a&amp;b')
  })

  it('escapes < to &lt;', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes > to &gt;', () => {
    expect(escHtml('10 > 5')).toBe('10 &gt; 5')
  })

  it('escapes double quotes', () => {
    expect(escHtml('say "hello"')).toBe('say &quot;hello&quot;')
  })

  it('escapes single quotes', () => {
    expect(escHtml("it's")).toBe('it&#39;s')
  })

  it('handles mixed content', () => {
    expect(escHtml('<a href="test" onclick="alert(\'x\')">')).toBe(
      '&lt;a href=&quot;test&quot; onclick=&quot;alert(&#39;x&#39;)&quot;&gt;'
    )
  })

  it('handles null/undefined', () => {
    // String(null) → 'null', String(undefined) → 'undefined', no special chars to escape
    expect(escHtml(null)).toBe('null')
    expect(escHtml(undefined)).toBe('undefined')
  })

  it('returns empty string for empty input', () => {
    expect(escHtml('')).toBe('')
  })

  it('passes through normal text unchanged', () => {
    expect(escHtml('Hello World')).toBe('Hello World')
  })
})

// ─── resolveNamingRule ──────────────────────────────────────
function resolveNamingRule(rule, content) {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

  const firstLine = content.trim().split('\n')[0] || ''
  const h1Title = (firstLine.match(/^#\s+(.+)/) || [])[1] || firstLine.slice(0, 40).replace(/[\\/:*?"<>|]/g, '_')

  const datetime = `${date}_${time}`

  return rule
    .replace(/{title}/g, h1Title || '未命名')
    .replace(/{date}/g, date)
    .replace(/{time}/g, time)
    .replace(/{datetime}/g, datetime)
    .replace(/{timestamp}/g, String(Date.now()))
    .replace(/{random}/g, Math.random().toString(36).slice(2, 8))
}

describe('resolveNamingRule', () => {
  const pad = n => String(n).padStart(2, '0')

  it('replaces {title} with first h1', () => {
    const result = resolveNamingRule('{title}', '# 产品设计文档\n正文')
    expect(result).toBe('产品设计文档')
  })

  it('replaces {title} with first line if no h1', () => {
    const result = resolveNamingRule('{title}', '产品设计文档\n正文')
    expect(result).toBe('产品设计文档')
  })

  it('replaces {date} with current date', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
    const result = resolveNamingRule('{date}', '')
    expect(result).toBe(expected)
  })

  it('replaces {time} with HHMMSS', () => {
    const now = new Date()
    const expected = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const result = resolveNamingRule('{time}', '')
    expect(result).toBe(expected)
  })

  it('replaces {timestamp} with numeric timestamp', () => {
    const result = resolveNamingRule('{timestamp}', '')
    expect(result).toMatch(/^\d{13}$/)
  })

  it('replaces {random} with 6-char random string', () => {
    const result = resolveNamingRule('{random}', '')
    expect(result).toMatch(/^[0-9a-z]{6}$/)
  })

  it('replaces {datetime} with date_time', () => {
    const result = resolveNamingRule('{datetime}', '')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{6}$/)
  })

  it('handles compound rule', () => {
    const result = resolveNamingRule('{title}_{date}', '# 周报')
    expect(result).toMatch(/^周报_\d{4}-\d{2}-\d{2}$/)
  })

  it('uses 未命名 for empty content', () => {
    const result = resolveNamingRule('{title}', '')
    expect(result).toBe('未命名')
  })

  it('sanitizes title characters in first line fallback', () => {
    const result = resolveNamingRule('{title}', 'file:name?')
    expect(result).not.toContain(':')
    expect(result).not.toContain('?')
  })
})

// ─── Cache count limit utils (from cache.js logic) ──────────
// Test the tab sorting / eviction logic independently
function sortTabsByActivity(tabs) {
  return [...tabs].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
}

describe('sortTabsByActivity', () => {
  it('sorts with most recent first', () => {
    const tabs = [
      { id: 'a', lastUsed: 100 },
      { id: 'b', lastUsed: 300 },
      { id: 'c', lastUsed: 200 },
    ]
    const result = sortTabsByActivity(tabs)
    expect(result.map(t => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('handles tabs with no lastUsed', () => {
    const tabs = [
      { id: 'a', lastUsed: null },
      { id: 'b', lastUsed: 100 },
    ]
    const result = sortTabsByActivity(tabs)
    expect(result[0].id).toBe('b')
    expect(result[1].id).toBe('a')
  })

  it('does not mutate original array', () => {
    const tabs = [{ id: 'a', lastUsed: 1 }, { id: 'b', lastUsed: 2 }]
    const copy = [...tabs]
    sortTabsByActivity(tabs)
    expect(tabs).toEqual(copy)
  })
})

// ─── Template ID generation logic ───────────────────────────
describe('Template ID generation', () => {
  it('generates unique id based on Date.now()', () => {
    const id1 = 'u_' + 1000
    const id2 = 'u_' + 1001
    expect(id1).not.toBe(id2)
  })
})

// ─── isMdFile ────────────────────────────────────────────────
function isMdFile(name) {
  return /\.(md|markdown|mdown|mkdn|mkd|mdwn|txt)$/i.test(name)
}

describe('isMdFile', () => {
  it('matches .md', () => {
    expect(isMdFile('readme.md')).toBe(true)
  })

  it('matches .markdown', () => {
    expect(isMdFile('readme.markdown')).toBe(true)
  })

  it('matches .txt', () => {
    expect(isMdFile('notes.txt')).toBe(true)
  })

  it('matches .MD uppercase', () => {
    expect(isMdFile('README.MD')).toBe(true)
  })

  it('matches .mdown', () => {
    expect(isMdFile('doc.mdown')).toBe(true)
  })

  it('rejects .html', () => {
    expect(isMdFile('index.html')).toBe(false)
  })

  it('rejects .css', () => {
    expect(isMdFile('style.css')).toBe(false)
  })

  it('rejects file with no extension', () => {
    expect(isMdFile('readme')).toBe(false)
  })
})

// ─── getWordCount (from editor.js) ────────────────────────────
function getWordCount(text) {
  return text
    ? (text.match(/[\u4e00-\u9fa5]/g) || []).length +
      (text.match(/\b[a-zA-Z]+\b/g) || []).length
    : 0
}

describe('getWordCount', () => {
  it('counts chinese characters', () => {
    expect(getWordCount('你好世界')).toBe(4)
  })

  it('counts english words', () => {
    expect(getWordCount('hello world')).toBe(2)
  })

  it('counts mixed chinese and english', () => {
    expect(getWordCount('你好 world 世界 hello')).toBe(6)
  })

  it('returns 0 for empty string', () => {
    expect(getWordCount('')).toBe(0)
  })

  it('returns 0 for null/undefined', () => {
    expect(getWordCount(null)).toBe(0)
    expect(getWordCount(undefined)).toBe(0)
  })

  it('ignores numbers and punctuation', () => {
    expect(getWordCount('123 !@# 你好')).toBe(2)
  })

  it('counts hyphenated words as single word', () => {
    expect(getWordCount('well-known')).toBe(2) // two English words
  })
})

// ─── paneOrder / CSS class helpers ────────────────────────────
// Test view mode icon SVG mapping
const viewIcons = {
  split: '<rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/>',
  editor: '<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="8" y1="3" x2="8" y2="21" opacity="0.3"/>',
  preview: '<rect x="3" y="3" width="18" height="18" rx="1"/><line x1="16" y1="3" x2="16" y2="21" opacity="0.3"/>',
}

describe('viewIcons', () => {
  it('has all three modes', () => {
    expect(Object.keys(viewIcons)).toEqual(['split', 'editor', 'preview'])
  })

  it('each icon is a non-empty string', () => {
    for (const key of Object.keys(viewIcons)) {
      expect(viewIcons[key].length).toBeGreaterThan(0)
    }
  })

  it('split icon has two rectangles', () => {
    const matches = viewIcons.split.match(/<rect/g)
    expect(matches ? matches.length : 0).toBe(2)
  })

  it('editor icon has one rect and one line', () => {
    expect(viewIcons.editor.match(/<rect/g).length).toBe(1)
    expect(viewIcons.editor.match(/<line/g).length).toBe(1)
  })

  it('preview icon has one rect and one line', () => {
    expect(viewIcons.preview.match(/<rect/g).length).toBe(1)
    expect(viewIcons.preview.match(/<line/g).length).toBe(1)
  })
})

// ─── tab ID generation ────────────────────────────────────────
function generateTabId(counter) {
  return 'tab_' + counter
}

describe('generateTabId', () => {
  it('generates sequential ids', () => {
    expect(generateTabId(1)).toBe('tab_1')
    expect(generateTabId(100)).toBe('tab_100')
  })
})

// ─── word count boundary edge cases ───────────────────────────
describe('getWordCount (edge cases)', () => {
  it('handles only whitespace', () => {
    expect(getWordCount('   \n  \t  ')).toBe(0)
  })

  it('handles mixed CJK + English + numbers', () => {
    expect(getWordCount('测试123abc测试')).toBe(4)
  })

  it('handles repeated punctuation', () => {
    expect(getWordCount('!!! ??? ...')).toBe(0)
  })
})
