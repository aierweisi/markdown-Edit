/**
 * Add copy buttons to each code block in the preview.
 * Called after the preview HTML is applied.
 * Uses a delegated click handler so re-renders don't need re-attachment.
 */

const COPY_BTN_CLASS = 'code-copy-btn'
const COPIED_CLASS = 'copied'
const COPY_TEXT = '复制'
const COPIED_TEXT = '已复制'

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
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = COPIED_TEXT
      btn.classList.add(COPIED_CLASS)
      setTimeout(() => {
        btn.textContent = COPY_TEXT
        btn.classList.remove(COPIED_CLASS)
      }, 2000)
    }).catch(() => {
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
      btn.textContent = COPIED_TEXT
      btn.classList.add(COPIED_CLASS)
      setTimeout(() => {
        btn.textContent = COPY_TEXT
        btn.classList.remove(COPIED_CLASS)
      }, 2000)
    })
  })
}

/**
 * Ensure every <pre class="code-pre"> has a copy button.
 * Safe to call after every render — the function is idempotent.
 */
export function updateCodeCopyButtons(host: HTMLElement): void {
  host.querySelectorAll<HTMLPreElement>('pre.code-pre').forEach((pre) => {
    if (pre.querySelector(`.${COPY_BTN_CLASS}`)) return
    const btn = document.createElement('button')
    btn.className = COPY_BTN_CLASS
    btn.textContent = COPY_TEXT
    // Prevent the button from being selected or dragged
    btn.setAttribute('draggable', 'false')
    pre.appendChild(btn)
  })
}