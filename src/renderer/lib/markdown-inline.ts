/**
 * Markdown helpers used inline by the editor (CM6 keymap for list continuation,
 * heading anchor slug generation, etc). Pure functions, no DOM.
 */

const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+/

export interface ListContinuation {
  prefix: string
  emptyDeletion: boolean
}

/**
 * Given a current line, compute the continuation prefix for an Enter press
 * inside a list. Returns null if the line isn't a list item.
 * - Returning `{prefix:'', emptyDeletion:true}` means the line was an empty
 *   list marker that should be cleared (CM6 will delete and break the list).
 */
export function continueList(currentLine: string): ListContinuation | null {
  const match = currentLine.match(LIST_RE)
  if (!match) return null
  const [whole, indent, marker] = match
  const rest = currentLine.slice(whole.length)
  if (rest.trim().length === 0) {
    return { prefix: '', emptyDeletion: true }
  }
  // Increment ordered list numbers.
  if (/^\d+\.$/.test(marker)) {
    const num = parseInt(marker, 10) + 1
    return { prefix: `${indent}${num}. `, emptyDeletion: false }
  }
  return { prefix: `${indent}${marker} `, emptyDeletion: false }
}

const ANCHOR_STRIP = /[^\p{L}\p{N}\s-]/gu
const ANCHOR_WS = /\s+/g

export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(ANCHOR_STRIP, '')
    .replace(ANCHOR_WS, '-')
    .replace(/-+$/g, '')
}
