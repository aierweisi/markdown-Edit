import { describe, expect, it } from 'vitest'
import {
  countChars,
  countWords,
  estimateReadingMinutes,
} from '../src/renderer/lib/word-count'

describe('countWords', () => {
  it('returns 0 for empty', () => {
    expect(countWords('')).toBe(0)
  })
  it('counts latin words separated by spaces', () => {
    expect(countWords('hello world foo bar')).toBe(4)
  })
  it('counts CJK chars individually', () => {
    expect(countWords('你好世界')).toBe(4)
  })
  it('mixes CJK and latin', () => {
    expect(countWords('hello 你好')).toBe(3)
  })
  it('ignores punctuation', () => {
    expect(countWords('hello, world.')).toBe(2)
  })
  it('hyphenated word is single word', () => {
    expect(countWords('state-of-the-art')).toBe(1)
  })
})

describe('countChars', () => {
  it('totals chars and excludes whitespace', () => {
    expect(countChars('hello world')).toEqual({ total: 11, noWhitespace: 10 })
  })
  it('handles empty', () => {
    expect(countChars('')).toEqual({ total: 0, noWhitespace: 0 })
  })
})

describe('estimateReadingMinutes', () => {
  it('minimum 1 minute', () => {
    expect(estimateReadingMinutes(50)).toBe(1)
  })
  it('300 words = 1 minute', () => {
    expect(estimateReadingMinutes(300)).toBe(1)
  })
  it('rounds up', () => {
    expect(estimateReadingMinutes(301)).toBe(2)
    expect(estimateReadingMinutes(900)).toBe(3)
  })
})
