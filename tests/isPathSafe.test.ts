import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { isPathSafe } from '../src/main/security/isPathSafe'

describe('isPathSafe with workspaceRoot', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mdedit-ws-'))
    writeFileSync(join(root, 'a.md'), 'x')
  })
  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('allows absolute paths inside the workspace root', () => {
    expect(isPathSafe(join(root, 'a.md'), root)).toBe(true)
  })

  it('rejects paths that escape the workspace root via ..', () => {
    expect(isPathSafe(join(root, '..', 'evil.md'), root)).toBe(false)
  })

  it('rejects traversal that normalizes back outside the root', () => {
    expect(isPathSafe(join(root, 'sub', '..', '..', 'evil.md'), root)).toBe(false)
  })

  it('still rejects non-absolute / empty input', () => {
    expect(isPathSafe('', root)).toBe(false)
    expect(isPathSafe('relative/a.md', root)).toBe(false)
  })
})
