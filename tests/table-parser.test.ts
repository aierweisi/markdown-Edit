import { describe, it, expect } from 'vitest'
import {
  isTableRow,
  isSeparatorRow,
  findTableRange,
  cellRanges,
  cellIndexAt,
  cellContentPos,
} from '../src/renderer/editor/table/table-parser'

describe('table-parser', () => {
  it('classifies rows and separators', () => {
    expect(isTableRow('| a | b |')).toBe(true)
    expect(isTableRow('  | a |')).toBe(true)
    expect(isTableRow('plain text')).toBe(false)
    expect(isSeparatorRow('| --- | --- |')).toBe(true)
    expect(isSeparatorRow('|:--:|:-:|')).toBe(true)
    expect(isSeparatorRow('| a | b |')).toBe(false)
  })

  it('findTableRange spans contiguous rows and requires a separator', () => {
    const lines = ['intro', '| h1 | h2 |', '| --- | --- |', '| a | b |', 'outro']
    expect(findTableRange(lines, 2)).toEqual({ fromLine: 1, toLine: 3 })
    expect(findTableRange(lines, 0)).toBeNull()
    expect(findTableRange(['| foo |'], 0)).toBeNull()
  })

  it('cellRanges splits a row between pipes', () => {
    expect(cellRanges('| a | b |')).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 8 },
    ])
  })

  it('cellRanges skips escaped pipes', () => {
    expect(cellRanges('| a\\|b | c |')).toHaveLength(2)
  })

  it('cellIndexAt locates the active cell', () => {
    const text = '| a | b |'
    expect(cellIndexAt(text, 2)).toBe(0)
    expect(cellIndexAt(text, 6)).toBe(1)
    expect(cellIndexAt(text, 999)).toBe(-1)
  })

  it('cellContentPos lands on trimmed content start', () => {
    expect(cellContentPos('| a | b |', { from: 1, to: 4 })).toBe(2)
  })
})
