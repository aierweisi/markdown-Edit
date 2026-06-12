/**
 * Count "words" the way the markdown editor displays in the status bar:
 *  - CJK characters each count as 1.
 *  - Latin word groups (letters/digits/underscores/dashes) count as 1 each.
 *  - Whitespace and punctuation do not count.
 *
 * Suitable for incremental use: pass a delta and the existing total to update
 * without rescanning the whole document. For full-document recounts, call
 * `countWords(text)`.
 */
const CJK = /[一-鿿぀-ゟ゠-ヿ]/
const WORD_CHAR = /[A-Za-z0-9_-]/

export function countWords(text: string): number {
  if (!text) return 0
  let total = 0
  let inWord = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (!ch) continue
    if (CJK.test(ch)) {
      total++
      inWord = false
    } else if (WORD_CHAR.test(ch)) {
      if (!inWord) {
        total++
        inWord = true
      }
    } else {
      inWord = false
    }
  }
  return total
}

export interface CharCounts {
  total: number
  noWhitespace: number
}

export function countChars(text: string): CharCounts {
  if (!text) return { total: 0, noWhitespace: 0 }
  let noWs = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch && !/\s/.test(ch)) noWs++
  }
  return { total: text.length, noWhitespace: noWs }
}

export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 300))
}
