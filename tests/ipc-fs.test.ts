import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CH } from '@shared/ipc'
import { registerFsIpc } from '../src/main/ipc/fs'

// Capture each handler registered via ipcMain.handle so we can invoke it directly.
const { handles } = vi.hoisted(() => ({ handles: new Map<string, (...a: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => {
      handles.set(ch, fn)
    },
  },
}))

registerFsIpc()

const isWin = process.platform === 'win32'
const cwd = process.cwd()
// Absolute path whose parent directory does not exist → isPathSafe returns false.
// (fs.ts runs pathResolve *before* isPathSafe, so a `..` path gets normalized away and
// would resolve to a real system dir; we need a path isPathSafe actually rejects.)
const unsafePath = isWin
  ? `C:\\definitely-missing-${Date.now()}\\sub\\file.md`
  : `/definitely-missing-${Date.now()}/sub/file.md`
const tmpFile = () =>
  join(tmpdir(), `vitest-fs-${Date.now()}-${Math.random().toString(36).slice(2)}.md`)

describe('fs IPC: FILE_READ', () => {
  const read = (p: unknown) => handles.get(CH.FILE_READ)!({} as never, p)

  it('rejects non-string input (zod)', async () => {
    await expect(read(42)).resolves.toMatchObject({ success: false, error: 'invalid request' })
  })

  it('rejects path traversal', async () => {
    await expect(read(unsafePath)).resolves.toMatchObject({ success: false, error: 'invalid path' })
  })

  it('reads an existing file', async () => {
    const res = (await read(join(cwd, 'package.json'))) as { success: boolean; content: string }
    expect(res.success).toBe(true)
    expect(res.content).toContain('"name"')
  })
})

describe('fs IPC: FILE_SAVE', () => {
  const save = (p: unknown, c: unknown) => handles.get(CH.FILE_SAVE)!({} as never, p, c)

  it('rejects non-string content (zod)', async () => {
    await expect(save(join(cwd, 'x.md'), 123)).resolves.toMatchObject({
      success: false,
      error: 'invalid request',
    })
  })

  it('rejects unsafe path', async () => {
    await expect(save(unsafePath, 'x')).resolves.toMatchObject({
      success: false,
      error: 'invalid path',
    })
  })

  it('writes atomically and reads back', async () => {
    const target = tmpFile()
    await expect(save(target, 'hello world')).resolves.toMatchObject({ success: true })
    expect(readFileSync(target, 'utf-8')).toBe('hello world')
    await fsp.unlink(target)
  })
})

describe('fs IPC: FILE_RENAME', () => {
  const rename = (o: unknown, n: unknown) => handles.get(CH.FILE_RENAME)!({} as never, o, n)

  it('no-ops when old path equals new path', async () => {
    const p = join(cwd, 'package.json')
    const res = (await rename(p, p)) as { success: boolean }
    expect(res.success).toBe(true)
  })

  it('rejects unsafe new path', async () => {
    await expect(rename(join(cwd, 'package.json'), unsafePath)).resolves.toMatchObject({
      success: false,
      error: 'invalid path',
    })
  })

  it('renames a real file', async () => {
    const a = tmpFile()
    const b = tmpFile()
    await fsp.writeFile(a, 'moved')
    const res = (await rename(a, b)) as { success: boolean }
    expect(res.success).toBe(true)
    expect(readFileSync(b, 'utf-8')).toBe('moved')
    await fsp.unlink(b)
  })
})
