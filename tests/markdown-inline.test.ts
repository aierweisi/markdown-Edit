import { describe, expect, it } from 'vitest'
import { continueList, slugify } from '../src/renderer/lib/markdown-inline'

describe('continueList', () => {
  it('returns null for non-list line', () => {
    expect(continueList('plain text')).toBeNull()
  })
  it('continues unordered list', () => {
    expect(continueList('- foo')).toEqual({ prefix: '- ', emptyDeletion: false })
  })
  it('continues ordered list with incremented number', () => {
    expect(continueList('1. foo')).toEqual({ prefix: '2. ', emptyDeletion: false })
    expect(continueList('  7. bar')).toEqual({ prefix: '  8. ', emptyDeletion: false })
  })
  it('flags empty list marker as deletion', () => {
    expect(continueList('- ')).toEqual({ prefix: '', emptyDeletion: true })
    expect(continueList('1. ')).toEqual({ prefix: '', emptyDeletion: true })
  })
  it('preserves indentation', () => {
    expect(continueList('    * item')).toEqual({ prefix: '    * ', emptyDeletion: false })
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
  it('strips punctuation', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
  })
  it('preserves CJK and digits', () => {
    expect(slugify('Hello 世界 2026')).toBe('hello-世界-2026')
  })
  it('trims trailing hyphens', () => {
    expect(slugify('foo---')).toBe('foo')
  })
})
