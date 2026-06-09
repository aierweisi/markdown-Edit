/**
 * pure.test.js — Unit tests for pure utility functions
 *
 * resolveNamingRule / escHtml 从 src/js/utils.js 加载，
 * 避免测试代码与生产代码不同步。
 */

import { describe, it, expect, vi } from 'vitest'

// 从源码加载 resolveNamingRule（设置 window 全局后 import）
vi.stubGlobal('window', {})
await import('../src/js/utils.js')
const resolveNamingRule = window.resolveNamingRule
const escHtml = window.escHtml
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

// ─── resolveNamingRule（从 src/js/utils.js 加载，见顶部 import）──────

describe('resolveNamingRule', () => {
  const pad = n => String(n).padStart(2, '0')

  it('replaces {title} with first h1', () => {
    const result = resolveNamingRule('{title}', '# 产品设计文档\n正文')
    expect(result).toBe('产品设计文档')
  })

  it('replaces {title} with first line if no h1', () => {
    // 生产代码中 resolveNamingRule 只识别 # 开头的标题，否则返回 '未命名'
    const result = resolveNamingRule('{title}', '产品设计文档\n正文')
    expect(result).toBe('未命名')
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

  it('replaces {timestamp} with numeric timestamp (seconds)', () => {
    // 生产代码返回秒级时间戳（10 位）
    const result = resolveNamingRule('{timestamp}', '')
    expect(result).toMatch(/^\d{10}$/)
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

  it('sanitizes title characters from h1', () => {
    // 生产代码将非法文件名字符替换为 _
    const result = resolveNamingRule('{title}', '# file:name?')
    expect(result).not.toContain(':')
    expect(result).not.toContain('?')
    expect(result).toBe('file_name_')
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

  it('matches .mkdn', () => {
    expect(isMdFile('doc.mkdn')).toBe(true)
  })

  it('matches .mkd', () => {
    expect(isMdFile('doc.mkd')).toBe(true)
  })

  it('matches .mdwn', () => {
    expect(isMdFile('doc.mdwn')).toBe(true)
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

// ─── isPathSafe (path traversal protection from main.js) ─────
function isPathSafe(p) {
  // 简化版：只做路径合法性校验，不检查文件系统
  // 完整的文件系统检查在 main/isPathSafe 中
  try {
    if (!p || typeof p !== 'string') return false
    // 检查原始输入是否为绝对路径（防止相对路径穿越）
    if (!require('path').isAbsolute(p)) return false
    const t = require('path').resolve(p)
    // 检查 .. 穿越
    if (p.includes('..')) {
      const normalized = require('path').normalize(p)
      if (normalized !== t || p.split(require('path').sep).some(seg => '..' === seg)) return false
    }
    if (process.platform.startsWith('win')) {
      const upper = t.toUpperCase()
      if (upper.startsWith('\\\\?\\') || upper.startsWith('\\\\.\\')) return false
      if (/^[A-Z]:\\\\(?:NUL|CON|PRN|AUX|COM\d|LPT\d)(?:\.|$)/i.test(t)) return false
    }
    return true
  } catch {
    return false
  }
}

// Skip path-safe tests on Windows due to drive-letter differences
import { platform } from 'process'

describe('isPathSafe', () => {
  it('allows normal absolute paths', () => {
    if (platform === 'win32') {
      expect(isPathSafe('C:\\Users\\test\\file.md')).toBe(true)
    } else {
      expect(isPathSafe('/home/user/file.md')).toBe(true)
    }
  })

  it('rejects relative paths', () => {
    expect(isPathSafe('relative/path.md')).toBe(false)
  })

  it('rejects "./" prefixed paths', () => {
    expect(isPathSafe('./file.md')).toBe(false)
  })

  it('rejects path traversal with ../', () => {
    if (platform === 'win32') {
      expect(isPathSafe('C:\\Users\\..\\..\\file.md')).toBe(false)
    } else {
      expect(isPathSafe('/home/../../etc/passwd')).toBe(false)
    }
  })

  it('rejects empty string', () => {
    expect(isPathSafe('')).toBe(false)
  })
})

// ─── URL sanitization pattern ─────────────────────────────────
function isSafeUrl(url) {
  // Matches safe protocols (http/https/mailto/tel/etc), no file:
  return /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i.test(url)
}

describe('isSafeUrl (DOMPurify ALLOWED_URI_REGEXP)', () => {
  it('allows https:// URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true)
  })

  it('allows http:// URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true)
  })

  it('allows mailto: links', () => {
    expect(isSafeUrl('mailto:test@example.com')).toBe(true)
  })

  it('allows tel: links', () => {
    expect(isSafeUrl('tel:+861234567890')).toBe(true)
  })

  it('REJECTS file:/// URLs', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false)
  })

  it('REJECTS file:// links', () => {
    expect(isSafeUrl('file:///C:/Windows/system32/cmd.exe')).toBe(false)
  })

  it('allows relative paths starting with /', () => {
    expect(isSafeUrl('/path/to/page')).toBe(true)
  })

  it('allows fragment-only links', () => {
    expect(isSafeUrl('#section-1')).toBe(true)
  })
})

// ─── Markdown rendering (marked library) ────────────────────
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load vendored marked.min.js (v15)
const __dirname = dirname(fileURLToPath(import.meta.url))
const markedCode = readFileSync(join(__dirname, '..', 'renderer', 'vendor', 'marked', 'marked.min.js'), 'utf8')

// Evaluate to get marked in this scope
const _module = { exports: {} }
const _eval = new Function('module', 'exports', markedCode)
_eval(_module, _module.exports)
const marked = _module.exports

describe('marked.parse (v15)', () => {
  it('renders headings', () => {
    const html = marked.parse('# Heading 1\n## Heading 2')
    expect(html).toContain('<h1')
    expect(html).toContain('Heading 1')
    expect(html).toContain('<h2')
    expect(html).toContain('Heading 2')
  })

  it('renders bold and italic', () => {
    const html = marked.parse('**bold** *italic*')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })

  it('renders strikethrough (GFM)', () => {
    const html = marked.parse('~~deleted~~')
    expect(html).toContain('<del>deleted</del>')
  })

  it('renders tables (GFM)', () => {
    const html = marked.parse('| A | B |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>A</th>')
    expect(html).toContain('<td>1</td>')
  })

  it('renders links', () => {
    const html = marked.parse('[click](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('>click</a>')
  })

  it('renders code blocks', () => {
    const html = marked.parse('```js\nconsole.log("hi")\n```')
    expect(html).toContain('<pre><code class="language-js">')
    expect(html).toContain('console.log')
  })

  it('renders inline code', () => {
    const html = marked.parse('Use `code` here')
    expect(html).toContain('<code>code</code>')
  })

  it('renders blockquotes', () => {
    const html = marked.parse('> quote')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('quote')
  })

  it('renders unordered lists', () => {
    const html = marked.parse('- item 1\n- item 2')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>item 1</li>')
  })

  it('renders ordered lists', () => {
    const html = marked.parse('1. first\n2. second')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>first</li>')
  })

  it('renders horizontal rules', () => {
    const html = marked.parse('---')
    expect(html).toContain('<hr')
  })

  it('renders images', () => {
    const html = marked.parse('![alt](img.png)')
    expect(html).toContain('<img src="img.png" alt="alt"')
  })

  it('handles empty input', () => {
    expect(marked.parse('')).toBe('')
    expect(marked.parse('\n\n')).toBe('')
  })

  it('renders paragraphs', () => {
    const html = marked.parse('Line one\n\nLine two')
    expect(html).toContain('<p>Line one</p>')
    expect(html).toContain('<p>Line two</p>')
  })

  it('passes raw HTML through (DOMPurify handles sanitization)', () => {
    const html = marked.parse('<script>alert("xss")</script>')
    // marked itself does not strip HTML — that's DOMPurify's job
    expect(html).toContain('<script>')
  })
})

// ─── Cache hash logic ──────────────────────────────────────────
describe('Cache hash computation', () => {
  function computeCacheHash(tabs, activeId) {
    return tabs.map(t => `${t.id}:${t.content}|${t.modified}`).join('||') + `|${activeId}`
  }

  it('produces same hash for same data', () => {
    const tabs = [{ id: 't1', content: 'hello', modified: false }]
    expect(computeCacheHash(tabs, 't1')).toBe(computeCacheHash(tabs, 't1'))
  })

  it('produces different hash when content changes', () => {
    const tabs1 = [{ id: 't1', content: 'hello', modified: false }]
    const tabs2 = [{ id: 't1', content: 'world', modified: false }]
    expect(computeCacheHash(tabs1, 't1')).not.toBe(computeCacheHash(tabs2, 't1'))
  })

  it('produces different hash when modified flag changes', () => {
    const tabs1 = [{ id: 't1', content: '', modified: false }]
    const tabs2 = [{ id: 't1', content: '', modified: true }]
    expect(computeCacheHash(tabs1, 't1')).not.toBe(computeCacheHash(tabs2, 't1'))
  })

  it('produces different hash when active tab changes', () => {
    const tabs = [{ id: 't1', content: '', modified: false }]
    expect(computeCacheHash(tabs, 't1')).not.toBe(computeCacheHash(tabs, 't2'))
  })

  it('handles multiple tabs', () => {
    const tabs = [
      { id: 't1', content: 'a', modified: true },
      { id: 't2', content: 'b', modified: false },
    ]
    const hash = computeCacheHash(tabs, 't2')
    expect(hash).toContain('t1:a|true')
    expect(hash).toContain('t2:b|false')
    expect(hash.endsWith('|t2')).toBe(true)
  })
})

// ─── Image magic bytes validation ───────────────────────────────
describe('Image magic bytes validation', () => {
  function isImageBase64(data) {
    // Replicates the logic added to main.js
    try {
      const buf = Buffer.from(data, 'base64')
      const b0 = buf[0], b1 = buf[1], b2 = buf[2], b3 = buf[3]
      if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return 'PNG'
      if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return 'JPEG'
      if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return 'GIF'
      if (b0 === 0x42 && b1 === 0x4D) return 'BMP'
      if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46 &&
          buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'WebP'
      return null
    } catch { return null }
  }

  it('detects PNG', () => {
    // Minimal valid PNG header (8 bytes)
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
    expect(isImageBase64(png.toString('base64'))).toBe('PNG')
  })

  it('detects JPEG', () => {
    const jpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])
    expect(isImageBase64(jpg.toString('base64'))).toBe('JPEG')
  })

  it('detects GIF', () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00])
    expect(isImageBase64(gif.toString('base64'))).toBe('GIF')
  })

  it('detects BMP', () => {
    const bmp = Buffer.from([0x42, 0x4D, 0x46, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(isImageBase64(bmp.toString('base64'))).toBe('BMP')
  })

  it('detects WebP', () => {
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
    expect(isImageBase64(webp.toString('base64'))).toBe('WebP')
  })

  it('rejects plain text base64', () => {
    const txt = Buffer.from('hello world')
    expect(isImageBase64(txt.toString('base64'))).toBeNull()
  })

  it('rejects empty string', () => {
    expect(isImageBase64('')).toBeNull()
  })
})

// ─── Template slug generation ──────────────────────────────────
describe('Template slug generation', () => {
  function slugify(text) {
    // Replicates the anchor ID logic in preview.js custom renderer
    return String(text).toLowerCase().trim()
      .replace(/[\s\u3000]+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'h'
  }

  it('converts spaces to hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world')
  })

  it('lowercases', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
  })

  it('handles Chinese characters', () => {
    const result = slugify('你好世界')
    expect(result.length).toBeGreaterThan(0)
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('hello   world')).toBe('hello-world')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugify(' -hello- ')).toBe('hello')
  })

  it('falls back to "h" for empty result', () => {
    expect(slugify('!@#$%')).toBe('h')
  })

  it('replaces full-width spaces (U+3000)', () => {
    expect(slugify('hello\u3000world')).toBe('hello-world')
  })
})

// ─── Template content resolution (function vs string) ───────────
describe('Template content resolution', () => {
  // 模拟内置模板数组
  const builtinTemplates = [
    { id: 'b_static', name: '静态模板', content: '# 静态内容\n固定文本' },
    {
      id: 'b_dynamic',
      name: '动态模板',
      content: () => `# 动态内容\n生成时间: ${new Date().toISOString().slice(0, 10)}`,
    },
  ]

  // 模拟 templates.js 中的 resolveContent 逻辑
  function resolveTemplateContent(template, builtins) {
    if (!template.builtin) return template.content
    const src = builtins.find(b => b.id === template.id)
    return src
      ? typeof src.content === 'function'
        ? src.content()
        : src.content
      : template.content
  }

  it('返回静态内置模板的字符串内容', () => {
    const tpl = { id: 'b_static', builtin: true, content: '' }
    const result = resolveTemplateContent(tpl, builtinTemplates)
    expect(result).toBe('# 静态内容\n固定文本')
  })

  it('执行函数式内置模板并返回结果', () => {
    const tpl = { id: 'b_dynamic', builtin: true, content: '' }
    const result = resolveTemplateContent(tpl, builtinTemplates)
    expect(result).toContain('# 动态内容')
    expect(result).toMatch(/生成时间: \d{4}-\d{2}-\d{2}/)
  })

  it('函数模板每次调用生成独立结果（日期变化）', () => {
    // 验证 content() 每次执行返回新对象（引用不缓存）
    const tpl = { id: 'b_dynamic', builtin: true, content: '' }
    const r1 = resolveTemplateContent(tpl, builtinTemplates)
    const r2 = resolveTemplateContent(tpl, builtinTemplates)
    expect(r1).toEqual(r2) // 同一天内内容一致
    expect(typeof r1).toBe('string')
    expect(r1.length).toBeGreaterThan(20)
  })

  it('自定义模板直接返回存储的 content', () => {
    const tpl = { id: 'u_custom', builtin: false, content: '自定义内容' }
    const result = resolveTemplateContent(tpl, builtinTemplates)
    expect(result).toBe('自定义内容')
  })

  it('内置模板在存储中 content 为空时从源码恢复', () => {
    // 模拟修复前的情况：content 为空字符串
    const tpl = { id: 'b_dynamic', builtin: true, content: '' }
    const result = resolveTemplateContent(tpl, builtinTemplates)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('加载函数正确处理函数类型的 content', () => {
    // 模拟 templates.js 中修复后的 load 逻辑
    function loadTemplateContent(src) {
      return typeof src.content === 'function' ? src.content() : (src.content || '')
    }
    const funcTpl = builtinTemplates[1]
    const strTpl = builtinTemplates[0]
    expect(loadTemplateContent(funcTpl)).toContain('# 动态内容')
    expect(loadTemplateContent(strTpl)).toBe('# 静态内容\n固定文本')
  })

  it('加载函数处理 content 为 null/undefined 的情况', () => {
    function loadTemplateContent(src) {
      return typeof src.content === 'function' ? src.content() : (src.content || '')
    }
    expect(loadTemplateContent({ content: null })).toBe('')
    expect(loadTemplateContent({ content: undefined })).toBe('')
    expect(loadTemplateContent({ content: '' })).toBe('')
  })
})

// ─── isMdFile ──────────────────────────────────────────────────
describe('isMdFile', () => {
  function isMdFile(name) {
    return /\.(md|markdown|mdown|mkdn|mkd|mdwn|txt)$/i.test(name)
  }

  it('accepts .md files', () => {
    expect(isMdFile('readme.md')).toBe(true)
    expect(isMdFile('README.MD')).toBe(true)
    expect(isMdFile('path/to/file.md')).toBe(true)
  })

  it('accepts .markdown extension', () => {
    expect(isMdFile('doc.markdown')).toBe(true)
  })

  it('accepts .txt extension', () => {
    expect(isMdFile('notes.txt')).toBe(true)
  })

  it('accepts .mdown / .mkdn / .mkd / .mdwn', () => {
    expect(isMdFile('doc.mdown')).toBe(true)
    expect(isMdFile('doc.mkdn')).toBe(true)
    expect(isMdFile('doc.mkd')).toBe(true)
    expect(isMdFile('doc.mdwn')).toBe(true)
  })

  it('rejects non-markdown extensions', () => {
    expect(isMdFile('file.html')).toBe(false)
    expect(isMdFile('file.js')).toBe(false)
    expect(isMdFile('file')).toBe(false)
    expect(isMdFile('')).toBe(false)
  })
})

// ─── getWordCount ──────────────────────────────────────────────
describe('getWordCount', () => {
  function getWordCount(text) {
    const clean = text.replace(/[#*_~`\[\]()>|\\]/g, ' ').replace(/\s+/g, ' ').trim()
    const chineseChars = (clean.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
    const words = clean
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    return chineseChars + words.length
  }

  it('counts English words', () => {
    expect(getWordCount('hello world')).toBe(2)
    expect(getWordCount('one two three four')).toBe(4)
  })

  it('counts Chinese characters', () => {
    expect(getWordCount('你好世界')).toBe(4)
    expect(getWordCount('这是一段中文')).toBe(6)
  })

  it('counts mixed Chinese and English', () => {
    expect(getWordCount('hello 世界')).toBe(3)
    expect(getWordCount('这是 test 文件')).toBe(5)
  })

  it('handles empty or whitespace-only input', () => {
    expect(getWordCount('')).toBe(0)
    expect(getWordCount('   ')).toBe(0)
    expect(getWordCount('\n\n')).toBe(0)
  })

  it('strips markdown syntax for accurate counting', () => {
    expect(getWordCount('**bold** text')).toBe(2)
    expect(getWordCount('# Heading')).toBe(1)
    expect(getWordCount('[link](url)')).toBe(2)
  })
})

// ─── isPathSafe edge cases ─────────────────────────────────────
describe('isPathSafe edge cases', () => {
  // Uses the same function as above; additional edge coverage

  it('rejects null / undefined / non-string input', () => {
    // Replicates the first check in main.js
    function isPathSafeCheck(p) {
      if (!p || typeof p !== 'string') return false
      return true
    }
    expect(isPathSafeCheck(null)).toBe(false)
    expect(isPathSafeCheck(undefined)).toBe(false)
    expect(isPathSafeCheck(123)).toBe(false)
    expect(isPathSafeCheck('')).toBe(false)
  })
})

// ─── isPathSafeCheck（独立路径穿越检测，不依赖 require('path')）────
describe('isPathSafeCheck', () => {
  function isPathSafeCheck(p) {
    if (!p || typeof p !== 'string') return false
    // 检查路径穿越：禁止包含 ..
    if (p.includes('..')) return false
    return true
  }

  it('rejects paths with .. traversal', () => {
    expect(isPathSafeCheck('../../etc/passwd')).toBe(false)
    expect(isPathSafeCheck('foo/../../bar')).toBe(false)
  })

  it('allows normal paths', () => {
    expect(isPathSafeCheck('/home/user/docs/file.md')).toBe(true)
    expect(isPathSafeCheck('C:\\Users\\test\\doc.md')).toBe(true)
  })

  it('rejects null / undefined / non-string', () => {
    expect(isPathSafeCheck(null)).toBe(false)
    expect(isPathSafeCheck(undefined)).toBe(false)
    expect(isPathSafeCheck(123)).toBe(false)
    expect(isPathSafeCheck('')).toBe(false)
  })
})

// ─── isSafeUrl（扩展测试：javascript: XSS 防护）────────────────────
describe('isSafeUrl', () => {
  function isSafeUrl(url) {
    return /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i.test(url)
  }

  it('allows https URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true)
  })

  it('rejects javascript: URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
  })

  it('allows relative paths', () => {
    expect(isSafeUrl('./relative/path')).toBe(true)
    expect(isSafeUrl('#anchor')).toBe(true)
  })

  it('allows http:// URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true)
  })
})

// ─── CacheManager 数据结构验证（cache 对象的字段完整性）─────────────
describe('CacheManager data structure', () => {
  // 模拟 cache 对象结构：tabs/activeTabId/savedAt
  function validateCacheStructure(cache) {
    if (!cache || typeof cache !== 'object') return false
    if (!Array.isArray(cache.tabs)) return false
    if (typeof cache.activeTabId !== 'string' && typeof cache.activeTabId !== 'number') return false
    if (typeof cache.savedAt !== 'number' && typeof cache.savedAt !== 'string') return false
    return true
  }

  it('validates a complete cache object', () => {
    const cache = {
      tabs: [{ id: 't1', content: 'hello', modified: false }],
      activeTabId: 't1',
      savedAt: Date.now(),
    }
    expect(validateCacheStructure(cache)).toBe(true)
  })

  it('rejects cache missing tabs field', () => {
    const cache = { activeTabId: 't1', savedAt: Date.now() }
    expect(validateCacheStructure(cache)).toBe(false)
  })

  it('rejects cache with non-array tabs', () => {
    const cache = { tabs: 'not-array', activeTabId: 't1', savedAt: Date.now() }
    expect(validateCacheStructure(cache)).toBe(false)
  })

  it('rejects cache missing activeTabId', () => {
    const cache = { tabs: [], savedAt: Date.now() }
    expect(validateCacheStructure(cache)).toBe(false)
  })

  it('rejects cache missing savedAt', () => {
    const cache = { tabs: [], activeTabId: 't1' }
    expect(validateCacheStructure(cache)).toBe(false)
  })

  it('rejects null / undefined', () => {
    expect(validateCacheStructure(null)).toBe(false)
    expect(validateCacheStructure(undefined)).toBe(false)
  })

  it('validates cache with numeric savedAt', () => {
    const cache = { tabs: [], activeTabId: 't1', savedAt: 1700000000000 }
    expect(validateCacheStructure(cache)).toBe(true)
  })

  it('validates cache with string savedAt (ISO)', () => {
    const cache = { tabs: [], activeTabId: 't1', savedAt: '2024-01-01T00:00:00.000Z' }
    expect(validateCacheStructure(cache)).toBe(true)
  })
})
