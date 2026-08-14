import { describe, expect, it } from 'vitest'
import { ALLOWED_URI_REGEXP } from '../src/renderer/preview/uri-policy'

// DOMPurify strips any URI attribute whose value fails ALLOWED_URI_REGEXP
// (the <img src> becomes empty), so the image never renders. These cases pin
// the behaviour that local/relative image references must survive sanitization
// while script-execution schemes are blocked.
describe('ALLOWED_URI_REGEXP (DOMPurify preview URI policy)', () => {
  const accept = [
    'assets/icon.png',
    'assets/paste-2026-08-12_08-57-20-852.jpeg',
    'images/sub/dir/photo.jpg',
    'a.png',
    './relative.png',
    '../../up.png',
    '/absolute/root.png',
    'https://example.com/x.png',
    'http://example.com/x.png',
    'file:///C:/Users/me/notes/assets/x.png',
    'mailto:me@example.com',
  ]
  const reject = ['javascript:alert(1)', 'JavaScript:alert(1)', 'vbscript:msgbox', 'javascript:alert(1)//']

  it.each(accept)('accepts %s', (uri) => {
    expect(ALLOWED_URI_REGEXP.test(uri)).toBe(true)
  })

  it.each(reject)('rejects %s', (uri) => {
    expect(ALLOWED_URI_REGEXP.test(uri)).toBe(false)
  })

  // Regression: an unescaped `-` inside `[^a-z+.-:]` formed a range `.-:`
  // (U+002E..U+003A) that included `/`, so every `dir/file` path failed and
  // DOMPurify stripped the src — pasted images showed nothing.
  it('accepts a relative path whose first segment is followed by a slash', () => {
    expect(ALLOWED_URI_REGEXP.test('assets/x.png')).toBe(true)
  })
})
