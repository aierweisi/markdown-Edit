import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { AppContext } from '../context'
import { ALLOWED_URI_REGEXP } from '../preview/uri-policy'
import { showToast } from '../ui/toast'

interface CopyRichDeps {
  ctx: AppContext
  /** Current document markdown. */
  getContent(): string
}

// Paste-target-friendly base styles, inlined on the wrapper: many targets
// (公众号编辑器, some webmail) strip <style> blocks but honor inline styles.
// The <style> element below is a best-effort extra for targets that keep it
// (Word / 飞书 / docs). Light theme regardless of the app theme — paste
// targets almost always render on a light background.
const WRAPPER_STYLE =
  "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; " +
  'font-size: 15px; line-height: 1.7; color: #1c1e21; max-width: 820px;'
const DOC_STYLE = `
code { background: #f6f8fa; padding: 1px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; }
pre { background: #f6f8fa; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
pre code { background: transparent; padding: 0; }
blockquote { border-left: 3px solid #0366d6; margin: 1em 0; padding-left: 14px; color: #6a737d; }
table { border-collapse: collapse; }
table th, table td { border: 1px solid #e1e4e8; padding: 6px 12px; }
a { color: #0366d6; }
img { max-width: 100%; }
`

/**
 * Copy the current document to the clipboard as rich text (`text/html` with a
 * plain-markdown `text/plain` fallback), so pasting into 公众号 / 飞书 / Word
 * keeps headings, emphasis, code blocks and tables. Local `file://` images
 * cannot embed — targets drop them silently; remote https images survive.
 */
export async function copyRichText(deps: CopyRichDeps): Promise<void> {
  const content = deps.getContent()
  if (!content.trim()) {
    showToast('文档为空，没有可复制的内容', 'info')
    return
  }
  const rendered = String(await marked.parse(content))
  // Same sanitization + URI policy as the preview/export pipeline.
  const safe = DOMPurify.sanitize(rendered, { ADD_ATTR: ['target', 'rel'], ALLOWED_URI_REGEXP })
  const html = `<div style="${WRAPPER_STYLE}"><style>${DOC_STYLE}</style>${safe}</div>`

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([content], { type: 'text/plain' }),
      }),
    ])
    showToast('已复制为富文本，可直接粘贴', 'success')
  } catch {
    // ClipboardItem/clipboard-write unavailable (older Chromium or a focus
    // context that denies it) — degrade to plain markdown so the action still
    // does something useful instead of silently failing.
    try {
      await navigator.clipboard.writeText(content)
      showToast('已复制 Markdown 源文本（当前环境不支持富文本）', 'info')
    } catch {
      showToast('复制失败', 'error')
    }
  }
}
