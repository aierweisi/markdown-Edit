/**
 * Add copy buttons to each code block in the preview.
 * Called after the preview HTML is applied.
 * Uses a delegated click handler so re-renders don't need re-attachment.
 *
 * The "已复制" state lives on the <pre> (dataset), not the button: morphdom
 * discards and updateCodeCopyButtons rebuilds the button on every render, so
 * button-local state would reset mid-countdown.
 */

const COPY_BTN_CLASS = 'code-copy-btn'
const COPIED_CLASS = 'copied'
const COPY_TEXT = '复制'
const COPIED_TEXT = '已复制'
const COPIED_STATE = 'copyState'

function markCopied(pre: HTMLPreElement, btn: HTMLButtonElement): void {
  btn.textContent = COPIED_TEXT
  btn.classList.add(COPIED_CLASS)
  pre.dataset[COPIED_STATE] = '1'
  setTimeout(() => {
    delete pre.dataset[COPIED_STATE]
    // The button may have been rebuilt by a re-render — ask the pre for the
    // live one instead of holding a reference to a detached node.
    const cur = pre.querySelector<HTMLButtonElement>(`.${COPY_BTN_CLASS}`)
    if (cur && cur.isConnected) {
      cur.textContent = COPY_TEXT
      cur.classList.remove(COPIED_CLASS)
    }
  }, 2000)
}

export function initCodeCopy(host: HTMLElement): void {
  // One-time delegation: listen for clicks on .code-copy-btn inside the host
  if (host.dataset.codeCopyReady === '1') return
  host.dataset.codeCopyReady = '1'

  host.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(`.${COPY_BTN_CLASS}`)
    if (!btn) return
    const pre = btn.closest<HTMLPreElement>('pre.code-pre')
    if (!pre) return
    const code = pre.querySelector<HTMLElement>('code')
    if (!code) return

    const text = code.textContent ?? ''
    navigator.clipboard
      .writeText(text)
      .then(() => markCopied(pre, btn))
      .catch(() => {
        // Fallback: select text manually
        const range = document.createRange()
        range.selectNodeContents(code)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
          document.execCommand('copy')
          selection.removeAllRanges()
        }
        markCopied(pre, btn)
      })
  })
}

/**
 * Ensure every <pre class="code-pre"> has a copy button.
 * Safe to call after every render — the function is idempotent, and a button
 * rebuilt mid-countdown picks the copied state back up from the pre.
 */
export function updateCodeCopyButtons(host: HTMLElement): void {
  host.querySelectorAll<HTMLPreElement>('pre.code-pre').forEach((pre) => {
    if (pre.querySelector(`.${COPY_BTN_CLASS}`)) return
    const btn = document.createElement('button')
    btn.className = COPY_BTN_CLASS
    btn.textContent = COPY_TEXT
    // Prevent the button from being selected or dragged
    btn.setAttribute('draggable', 'false')
    if (pre.dataset[COPIED_STATE] === '1') {
      btn.textContent = COPIED_TEXT
      btn.classList.add(COPIED_CLASS)
    }
    pre.appendChild(btn)
  })
}
