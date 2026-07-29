export interface TaskLine {
  /** 1-based source line number. */
  line: number
  checked: boolean
  raw: string
}

const FENCE_OPEN_RE = /^(`{3,}|~{3,})/
const TASK_ITEM_RE = /^(\s*[-*+]\s+)\[([ x])\] /

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
    if (m) out.push({ line: i + 1, checked: m[2] === 'x', raw: text })
  }
  return out
}

/** Return the line with its task marker toggled `[ ]`↔`[x]`. */
export function toggleTaskLine(raw: string): string {
  return raw.replace(/^(\s*[-*+]\s+)\[([ x])\]/, (_m, prefix: string, mark: string) =>
    mark === 'x' ? `${prefix}[ ]` : `${prefix}[x]`,
  )
}
