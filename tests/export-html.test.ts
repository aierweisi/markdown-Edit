// @vitest-environment jsdom
// DOMPurify needs a real DOM, hence jsdom. Regression tests pin the export
// sanitize config: it must share the preview's URI policy (uri-policy.ts) so
// file:// images survive export, while script-scheme URIs stay stripped.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/export/export-dialog', () => ({
  resolveExportDialog: vi.fn(),
}))

import { resolveExportDialog } from '../src/renderer/export/export-dialog'
import { exportHtml } from '../src/renderer/export/export-html'
import type { AppContext } from '../src/renderer/context'

const fileSave = vi.fn().mockResolvedValue({ success: true })
const ctx = { api: { fileSave } } as unknown as AppContext

async function exportContent(markdown: string): Promise<string> {
  fileSave.mockClear()
  const ok = await exportHtml({ ctx, content: markdown, title: 't', theme: 'light' })
  expect(ok).toBe(true)
  return fileSave.mock.calls[0][1] as string
}

beforeEach(() => {
  vi.mocked(resolveExportDialog).mockResolvedValue('C:/tmp/export-test.html')
})

describe('exportHtml sanitize policy', () => {
  // Regression: DOMPurify's default URI whitelist has no file: scheme, so
  // file:// image srcs were stripped on export while rendering fine in the
  // preview. The export must reuse the preview's ALLOWED_URI_REGEXP.
  it('keeps file:// image srcs', async () => {
    const html = await exportContent('![](file:///C:/pics/a.png)')
    expect(html).toContain('file:///C:/pics/a.png')
  })

  it('keeps relative image srcs', async () => {
    const html = await exportContent('![](assets/x.png)')
    expect(html).toContain('assets/x.png')
  })

  it('keeps https links and mailto', async () => {
    const html = await exportContent('[site](https://example.com) [m](mailto:a@b.c)')
    expect(html).toContain('https://example.com')
    expect(html).toContain('mailto:a@b.c')
  })

  it('still strips script-scheme URIs', async () => {
    const html = await exportContent('[x](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })
})
