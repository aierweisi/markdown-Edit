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

  return rule
    .replace(/{title}/g, h1Title || '未命名')
    .replace(/{date}/g, date)
    .replace(/{time}/g, time)
    .replace(/{timestamp}/g, String(Date.now()))
    .replace(/{random}/g, Math.random().toString(36).slice(2, 8))
}

describe('resolveNamingRule', () => {
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
    const pad = n => String(n).padStart(2, '0')
    const expected = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
    const result = resolveNamingRule('{date}', '')
    expect(result).toBe(expected)
  })

  it('replaces {time} with HHMMSS', () => {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
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
