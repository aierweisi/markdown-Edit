import { stripMdExtension } from '@shared/paths'

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c)
}

export function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] ?? ''
}

export function titleFromPath(filePath: string): string {
  return stripMdExtension(getFileName(filePath))
}

const ILLEGAL_FILENAME = /[\\/:*?"<>|]/g

export function sanitizeFileName(name: string): string {
  return name.replace(ILLEGAL_FILENAME, '_')
}

export interface NamingContext {
  title?: string
  content?: string
  now?: Date
}

const NAMING_VARS: Record<string, (ctx: Required<NamingContext>) => string> = {
  '{title}': (c) => c.title || '未命名',
  '{date}': (c) => formatDate(c.now),
  '{time}': (c) => formatTime(c.now),
  '{datetime}': (c) => `${formatDate(c.now)}-${formatTime(c.now)}`,
  '{timestamp}': (c) => String(c.now.getTime()),
  '{random}': () => Math.random().toString(36).slice(2, 8),
}

export function resolveNamingRule(rule: string, ctx: NamingContext = {}): string {
  const filled: Required<NamingContext> = {
    title: ctx.title ?? extractTitleFromContent(ctx.content ?? '') ?? '未命名',
    content: ctx.content ?? '',
    now: ctx.now ?? new Date(),
  }
  let out = rule || '{title}_{date}'
  for (const [token, fn] of Object.entries(NAMING_VARS)) {
    if (out.includes(token)) out = out.split(token).join(fn(filled))
  }
  return sanitizeFileName(out)
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}${m}${s}`
}

function extractTitleFromContent(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || null
}
