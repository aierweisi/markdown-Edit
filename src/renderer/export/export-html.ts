import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { AppContext } from '../context'
import { escHtml, resolveNamingRule, sanitizeFileName } from '../lib/fs-paths'

interface ExportDeps {
  ctx: AppContext
  content: string
  title: string
  theme: 'light' | 'dark'
}

const STYLE_LIGHT = `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 820px; margin: 40px auto; padding: 0 24px; line-height: 1.7; color: #1c1e21; }
h1, h2, h3 { border-bottom: 1px solid #e1e4e8; padding-bottom: 4px; }
code { background: #f6f8fa; padding: 1px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; }
pre { background: #f6f8fa; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
pre code { background: transparent; padding: 0; }
blockquote { border-left: 3px solid #0366d6; margin: 1em 0; padding-left: 14px; color: #6a737d; }
table { border-collapse: collapse; }
table th, table td { border: 1px solid #e1e4e8; padding: 6px 12px; }
a { color: #0366d6; }
`

const STYLE_DARK = `
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 820px; margin: 40px auto; padding: 0 24px; line-height: 1.7; color: #e8e8ec; background: #0d0d10; }
h1, h2, h3 { border-bottom: 1px solid #21262d; padding-bottom: 4px; }
code { background: #161b22; padding: 1px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; }
pre { background: #161b22; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
pre code { background: transparent; padding: 0; }
blockquote { border-left: 3px solid #58a6ff; margin: 1em 0; padding-left: 14px; color: #8b949e; }
table { border-collapse: collapse; }
table th, table td { border: 1px solid #21262d; padding: 6px 12px; }
a { color: #58a6ff; }
`

export async function exportHtml(deps: ExportDeps): Promise<boolean> {
  const exportDir = (await deps.ctx.api.storeGet('exportDir')) ?? ''
  const namingRule = (await deps.ctx.api.storeGet('exportNamingRule')) ?? '{title}_{date}'
  const baseName =
    deps.title && deps.title !== '未命名'
      ? sanitizeFileName(deps.title)
      : resolveNamingRule(namingRule, { content: deps.content })
  const defaultPath = exportDir ? `${exportDir}/${baseName}.html` : `${baseName}.html`

  const dialog = await deps.ctx.api.dialogSaveFile({
    defaultPath,
    filters: [{ name: 'HTML', extensions: ['html'] }],
  })
  if (dialog.canceled || !dialog.filePath) return false

  const rendered = String(await marked.parse(deps.content))
  const safe = DOMPurify.sanitize(rendered, { ADD_ATTR: ['target', 'rel'] })
  const style = deps.theme === 'dark' ? STYLE_DARK : STYLE_LIGHT

  const html =
    '<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8">' +
    `<title>${escHtml(deps.title || 'Markdown')}</title><style>${style}</style></head>` +
    `<body>\n${safe}\n</body></html>\n`

  const result = await deps.ctx.api.fileSave(dialog.filePath, html)
  return result.success
}
