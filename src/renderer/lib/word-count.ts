/**
 * Word counter aligned with the v1 editor:
 *   total = (CJK char count) + (latin word group count)
 * where "latin word" means a contiguous run of [A-Za-z], split by anything
 * else. Digits, punctuation, whitespace, and non-CJK Unicode (e.g. Korean,
 * emoji) do not contribute.
 *
 * Counted via char-code scans rather than text.match(): a match() result
 * materializes an array with one single-char string per CJK character —
 * megabytes of garbage per call on large Chinese documents. One O(n) pass,
 * zero allocations; status bar callers debounce before invoking.
 */

// CJK range [一-龥] = U+4E00..U+9FA5, as char codes.
function isCjkCode(c: number): boolean {
  return c >= 0x4e00 && c <= 0x9fa5
}

function isLatinCode(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)
}

// The exact set JS regex \s matches (code units), kept as a char-code test.
function isWhitespaceCode(c: number): boolean {
  return (
    c === 0x20 ||
    (c >= 0x09 && c <= 0x0d) ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  )
}

export function countWords(text: string): number {
  if (!text) return 0
  let cjk = 0
  let latin = 0
  let prevLatin = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (isCjkCode(c)) cjk++
    const latinNow = isLatinCode(c)
    if (latinNow && !prevLatin) latin++
    prevLatin = latinNow
  }
  return cjk + latin
}

export interface CharCounts {
  total: number
  noWhitespace: number
}

export function countChars(text: string): CharCounts {
  if (!text) return { total: 0, noWhitespace: 0 }
  let whitespace = 0
  for (let i = 0; i < text.length; i++) {
    if (isWhitespaceCode(text.charCodeAt(i))) whitespace++
  }
  return { total: text.length, noWhitespace: text.length - whitespace }
}

export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 300))
}
