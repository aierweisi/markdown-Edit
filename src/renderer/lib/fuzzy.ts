/**
 * Tiny subsequence fuzzy matcher for command palette / recent files.
 * Returns a score (higher is better) and a list of matched character indices
 * the UI can use for highlighting. Non-matches return null.
 */
export interface FuzzyMatch {
  score: number
  indices: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] }
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const indices: number[] = []
  let score = 0
  let qi = 0
  let prevMatch = -2
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti)
      score += ti === prevMatch + 1 ? 4 : 1
      if (ti === 0 || /[\s/_\-.]/.test(t[ti - 1] ?? '')) score += 2
      prevMatch = ti
      qi++
    }
  }
  if (qi < q.length) return null
  // Shorter targets get a slight boost so exact title beats deep path.
  score -= Math.floor(target.length / 20)
  return { score, indices }
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  key: (item: T) => string,
): Array<{ item: T; match: FuzzyMatch }> {
  if (!query) return items.map((item) => ({ item, match: { score: 0, indices: [] } }))
  const result: Array<{ item: T; match: FuzzyMatch }> = []
  for (const item of items) {
    const match = fuzzyMatch(query, key(item))
    if (match) result.push({ item, match })
  }
  result.sort((a, b) => b.match.score - a.match.score)
  return result
}
