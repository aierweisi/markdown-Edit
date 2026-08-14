/**
 * Word counter aligned with the v1 editor:
 *   total = (CJK char count) + (latin word group count)
 * where "latin word" means a contiguous run of [A-Za-z], split by anything
 * else. Digits, punctuation, whitespace, and non-CJK Unicode (e.g. Korean,
 * emoji) do not contribute.
 *
 * Two single-pass regex scans keep this O(n) and predictable for documents
 * up to a few MB; status bar callers debounce before invoking.
 */
const CJK_RE = /[一-龥]/g
const LATIN_WORD_RE = /[A-Za-z]+/g

export function countWords(text: string): number {
  if (!text) return 0
  const cjk = text.match(CJK_RE)?.length ?? 0
  const latin = text.match(LATIN_WORD_RE)?.length ?? 0
  return cjk + latin
}

export interface CharCounts {
  total: number
  noWhitespace: number
}

export function countChars(text: string): CharCounts {
  if (!text) return { total: 0, noWhitespace: 0 }
  // One regex pass instead of a per-character regex test: O(n) with a single
  // matcher allocation rather than text.length separate ones.
  const whitespace = text.match(/\s/g)?.length ?? 0
  return { total: text.length, noWhitespace: text.length - whitespace }
}

export function estimateReadingMinutes(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 300))
}
