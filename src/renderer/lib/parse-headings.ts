export interface Heading {
  /** 1–6 */
  level: number
  /** Stripped heading text (without leading hashes). */
  text: string
  /** 1-based line number in the document. */
  line: number
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_RE = /^```/

/**
 * Extract ATX-style headings from a markdown document. Skips fenced code
 * blocks so `# foo` inside ```…``` is not treated as a heading.
 */
export function parseHeadings(text: string): Heading[] {
  if (!text) return []
  const lines = text.split('\n')
  const out: Heading[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = line.match(HEADING_RE)
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i + 1 })
  }
  return out
}
