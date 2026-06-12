import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyMatch } from '../src/renderer/lib/fuzzy'

describe('fuzzyMatch', () => {
  it('returns null for non-subsequence', () => {
    expect(fuzzyMatch('xyz', 'abc')).toBeNull()
  })
  it('matches subsequence and reports indices', () => {
    const m = fuzzyMatch('abc', 'a-b-c')
    expect(m).not.toBeNull()
    expect(m!.indices).toEqual([0, 2, 4])
  })
  it('case-insensitive', () => {
    expect(fuzzyMatch('AB', 'ab')).not.toBeNull()
  })
  it('empty query matches everything with score 0', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] })
  })
  it('scores adjacent matches higher than scattered', () => {
    const adjacent = fuzzyMatch('abc', 'abcdef')!
    const scattered = fuzzyMatch('abc', 'a-b-c')!
    expect(adjacent.score).toBeGreaterThan(scattered.score)
  })
})

describe('fuzzyFilter', () => {
  it('orders by score desc, drops non-matches', () => {
    const items = ['banana', 'apple', 'aPe']
    const result = fuzzyFilter(items, 'ap', (s) => s)
    const titles = result.map((r) => r.item)
    expect(titles).toContain('apple')
    expect(titles).toContain('aPe')
    expect(titles).not.toContain('banana')
  })

  it('returns all items unchanged when query empty', () => {
    const items = ['a', 'b', 'c']
    expect(fuzzyFilter(items, '', (s) => s).map((r) => r.item)).toEqual(items)
  })
})
