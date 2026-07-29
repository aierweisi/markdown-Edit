import { collectTaskLines, toggleTaskLine } from '../lib/task-lines'

export interface TaskCheckboxDeps {
  /** Current editor document text. */
  getDoc(): string
  /** Replace a 1-based source line with new text (flows through normal change). */
  onReplaceLine(line: number, newLine: string): void
}

const READY_ATTR = 'taskCheckboxReady'
const TASK_BOX_SELECTOR = 'input.task-list-checkbox'

/**
 * One-time delegated click handler: clicking a task checkbox toggles the
 * matching source `- [ ]`/`- [x]` item. Matching is by position (Nth checkbox
 * in the DOM ↔ Nth task line in the source), which stays correct because both
 * are produced in document order and code-block tasks are excluded on both sides.
 */
export function initTaskCheckbox(host: HTMLElement, deps: TaskCheckboxDeps): void {
  if (host.dataset[READY_ATTR] === '1') return
  host.dataset[READY_ATTR] = '1'

  host.addEventListener('click', (e: MouseEvent) => {
    const box = (e.target as HTMLElement).closest<HTMLInputElement>(TASK_BOX_SELECTOR)
    if (!box) return
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>(TASK_BOX_SELECTOR))
    const index = boxes.indexOf(box)
    if (index < 0) return
    const tasks = collectTaskLines(deps.getDoc())
    const task = tasks[index]
    if (!task) return
    deps.onReplaceLine(task.line, toggleTaskLine(task.raw))
  })
}

/**
 * After each render, sync each checkbox's `checked` with the source task state.
 * morphdom may not reliably sync the `checked` *property* (it's not an attribute),
 * so we set it explicitly to avoid visual drift.
 */
export function updateTaskCheckboxes(host: HTMLElement, getDoc: () => string): void {
  const tasks = collectTaskLines(getDoc())
  const boxes = host.querySelectorAll<HTMLInputElement>(TASK_BOX_SELECTOR)
  boxes.forEach((box, i) => {
    if (tasks[i]) box.checked = tasks[i].checked
  })
}
