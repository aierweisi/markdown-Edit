import { describe, expect, it, vi, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CH } from '@shared/ipc'
import { registerWorkspaceIpc } from '../src/main/ipc/workspace'

// Capture each handler registered via ipcMain.handle so we can invoke it directly.
const { handles } = vi.hoisted(() => ({ handles: new Map<string, (...a: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => {
      handles.set(ch, fn)
    },
  },
}))

const rootDir = join(tmpdir(), `vitest-ws-search-${Date.now()}-${Math.random().toString(36).slice(2)}`)
mkdirSync(join(rootDir, 'sub'), { recursive: true })
mkdirSync(join(rootDir, 'node_modules'), { recursive: true })
writeFileSync(join(rootDir, 'a.md'), '# Hello\nalpha needle here\n\nno match line\n')
writeFileSync(join(rootDir, 'sub', 'b.md'), 'needle in sub\nNEEDLE uppercase\n')
// txt counts as a markdown extension in this app (see MD_EXTENSIONS / the
// save dialog filters), so it IS searched — pin that behavior.
writeFileSync(join(rootDir, 'notes.txt'), 'needle in a txt note\n')
writeFileSync(join(rootDir, 'binary.exe'), 'needle never searched\n')
writeFileSync(join(rootDir, 'node_modules', 'x.md'), 'needle inside ignored dir\n')

let workspacePath: string | null = rootDir
registerWorkspaceIpc({
  get: (key: string) => (key === 'workspacePath' ? workspacePath : undefined),
} as never)

const search = (q: unknown) => handles.get(CH.WORKSPACE_SEARCH)!({} as never, q)

afterAll(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('workspace IPC: WORKSPACE_SEARCH', () => {
  it('rejects invalid input (zod)', async () => {
    await expect(search('')).resolves.toMatchObject({ success: false, error: 'invalid request' })
    await expect(search(123)).resolves.toMatchObject({ success: false, error: 'invalid request' })
  })

  it('errors when no workspace is open', async () => {
    const saved = workspacePath
    workspacePath = null
    await expect(search({ query: 'needle' })).resolves.toMatchObject({
      success: false,
      error: 'no workspace',
    })
    workspacePath = saved
  })

  it('finds case-insensitive matches in md files with correct line numbers', async () => {
    const res = (await search({ query: 'needle' })) as unknown as {
      success: boolean
      hits: Array<{ path: string; line: number; text: string }>
      truncated: boolean
    }
    expect(res.success).toBe(true)
    expect(res.truncated).toBe(false)
    // a.md line 2, notes.txt line 1, then sub/b.md lines 1+2 — .exe files and
    // node_modules are skipped, txt is searched (it's a markdown ext here).
    expect(res.hits).toHaveLength(4)
    expect(res.hits[0]).toMatchObject({ line: 2 })
    expect(res.hits[0]!.path.endsWith('a.md')).toBe(true)
    expect(res.hits[1]).toMatchObject({ line: 1 })
    expect(res.hits[1]!.path.endsWith('notes.txt')).toBe(true)
    expect(res.hits[2]).toMatchObject({ line: 1 })
    expect(res.hits[2]!.path.endsWith(join('sub', 'b.md'))).toBe(true)
    expect(res.hits[3]).toMatchObject({ line: 2 })
    // The uppercase variant matches case-insensitively and is reported verbatim.
    expect(res.hits[3]!.text).toContain('NEEDLE')
  })

  it('truncates when the hit cap is exceeded', async () => {
    const big = join(rootDir, 'big.md')
    writeFileSync(big, Array.from({ length: 600 }, () => 'needle line').join('\n'))
    try {
      const res = (await search({ query: 'needle line' })) as unknown as {
        success: boolean
        hits: unknown[]
        truncated: boolean
      }
      expect(res.success).toBe(true)
      expect(res.hits.length).toBeLessThanOrEqual(500)
      expect(res.truncated).toBe(true)
    } finally {
      rmSync(big, { force: true })
    }
  })
})

describe('workspace IPC: WORKSPACE_BACKLINKS', () => {
  const backlinks = (p: unknown) => handles.get(CH.WORKSPACE_BACKLINKS)!({} as never, p)

  it('finds files linking to the target via [[wiki]] (case-insensitive, one hit per line)', async () => {
    writeFileSync(
      join(rootDir, 'linker.md'),
      'see [[b]] and [[B|alias]] and [[nope]]\nplain [[b]] line\n',
    )
    try {
      const res = (await backlinks(join(rootDir, 'sub', 'b.md'))) as unknown as {
        success: boolean
        hits: Array<{ path: string; line: number }>
      }
      expect(res.success).toBe(true)
      expect(res.hits).toHaveLength(2)
      expect(res.hits[0]).toMatchObject({ line: 1 })
      expect(res.hits[0]!.path.endsWith('linker.md')).toBe(true)
      expect(res.hits[1]).toMatchObject({ line: 2 })
    } finally {
      rmSync(join(rootDir, 'linker.md'), { force: true })
    }
  })

  it('errors for a path outside the workspace', async () => {
    const outside = join(tmpdir(), `vitest-outside-${Date.now()}.md`)
    await expect(backlinks(outside)).resolves.toMatchObject({ success: false })
  })
})
