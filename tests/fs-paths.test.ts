import { describe, expect, it } from 'vitest'
import {
  escHtml,
  getFileName,
  resolveNamingRule,
  sanitizeFileName,
  titleFromPath,
} from '../src/renderer/lib/fs-paths'

describe('escHtml', () => {
  it('escapes all 5 entities', () => {
    expect(escHtml('a & b < c > d " e \' f')).toBe('a &amp; b &lt; c &gt; d &quot; e &#39; f')
  })
  it('preserves plain text', () => {
    expect(escHtml('hello world')).toBe('hello world')
  })
})

describe('getFileName / titleFromPath', () => {
  it('extracts filename from forward-slash path', () => {
    expect(getFileName('/foo/bar/baz.md')).toBe('baz.md')
  })
  it('extracts filename from back-slash path', () => {
    expect(getFileName('C:\\Users\\me\\note.md')).toBe('note.md')
  })
  it('strips markdown extension in titleFromPath', () => {
    expect(titleFromPath('/x/y/abc.md')).toBe('abc')
    expect(titleFromPath('/x/y/abc.markdown')).toBe('abc')
    expect(titleFromPath('/x/y/abc.txt')).toBe('abc')
  })
})

describe('sanitizeFileName', () => {
  it('strips illegal Windows filename chars', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })
})

describe('resolveNamingRule', () => {
  const fixedDate = new Date('2026-06-12T15:30:45')

  it('replaces {title}', () => {
    expect(resolveNamingRule('{title}', { title: 'my-doc', now: fixedDate })).toBe('my-doc')
  })

  it('extracts title from first heading when title not provided', () => {
    expect(
      resolveNamingRule('{title}', { content: '# Hello World\nbody', now: fixedDate }),
    ).toBe('Hello World')
  })

  it('combines date + title', () => {
    expect(resolveNamingRule('{title}_{date}', { title: 'note', now: fixedDate })).toBe(
      'note_20260612',
    )
  })

  it('falls back to 未命名 when no title and no heading', () => {
    expect(resolveNamingRule('{title}', { now: fixedDate })).toBe('未命名')
  })

  it('handles all date/time tokens', () => {
    expect(resolveNamingRule('{date}-{time}-{datetime}', { title: 'x', now: fixedDate })).toBe(
      '20260612-153045-20260612-153045',
    )
  })

  it('uses default rule when empty', () => {
    expect(resolveNamingRule('', { title: 'x', now: fixedDate })).toBe('x_20260612')
  })

  it('sanitizes the final filename', () => {
    expect(resolveNamingRule('{title}', { title: 'a/b?c', now: fixedDate })).toBe('a_b_c')
  })
})
