import { describe, it, expect } from 'vitest'
import { slugify } from '../src/renderer/lib/slugify'

describe('slugify', () => {
  it('lowercases and joins words with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('keeps CJK characters', () => {
    expect(slugify('你好 世界')).toBe('你好-世界')
  })

  it('strips emphasis marks before slugging', () => {
    expect(slugify('**Bold** and *italic*')).toBe('bold-and-italic')
  })

  it('reduces a link to its text', () => {
    expect(slugify('[Google](https://google.com)')).toBe('google')
  })

  it('drops other punctuation', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
  })

  it('collapses repeated hyphens and trims edges', () => {
    expect(slugify('  -- Title --  ')).toBe('title')
  })
})
