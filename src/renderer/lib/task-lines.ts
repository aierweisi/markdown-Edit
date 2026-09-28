export interface TaskLine {
  /** 1-based source line number. */
  line: number
  checked: boolean
  raw: string
}

const FENCE_OPEN_RE = /^(`{3,}|~{3,})/
// Task-list item as marked/GFM renders it: optional blockquote markers, list
// indentation, a bullet OR ordered-list marker, then the checkbox. The
// renderer draws a checkbox for ordered (`1. [ ]`) and blockquoted
// (`> - [ ]`) items too — a bullet-only pattern misaligns the Nth DOM
// checkbox with the Nth source line and clicks toggle the wrong row.
const TASK_ITEM_RE =
  /^((?:[ \t]{0,3}>+[ \t]?)*[ \t]{0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?= |$)/

/**
 * Collect GFM task-list items in source order, skipping fenced code blocks so
 * `- [ ]` text inside ```…``` is not mistaken for a task. The returned order
 * matches the order `<input class="task-list-checkbox">` elements appear in the
 * rendered preview.
 */
export function collectTaskLines(doc: string): TaskLine[] {
  const lines = doc.split('\n')
  const out: TaskLine[] = []
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]
    const open = text.match(FENCE_OPEN_RE)
    if (open) {
      const marker = open[1][0]
      fence = fence === null ? marker : fence === marker ? null : fence
      continue
    }
    if (fence !== null) continue
    const m = text.match(TASK_ITEM_RE)
    if (m) out.push({ line: i + 1, checked: m[2] === 'x' || m[2] === 'X', raw: text })
  }
  return out
}

/** Return the line with its task marker toggled `[ ]`↔`[x]`. */
export function toggleTaskLine(raw: string): string {
  return raw.replace(
    /^((?:[ \t]{0,3}>+[ \t]?)*[ \t]{0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\]/,
    (_m, prefix: string, mark: string) => (mark === 'x' || mark === 'X' ? `${prefix}[ ]` : `${prefix}[x]`),
  )
}
