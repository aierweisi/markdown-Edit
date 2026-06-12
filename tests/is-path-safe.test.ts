import { describe, expect, it } from 'vitest'
import { isPathSafe } from '../src/main/security/isPathSafe'

const isWin = process.platform === 'win32'

describe('isPathSafe', () => {
  it('rejects null / undefined / empty', () => {
    expect(isPathSafe(null)).toBe(false)
    expect(isPathSafe(undefined)).toBe(false)
    expect(isPathSafe('')).toBe(false)
  })

  it('rejects non-string', () => {
    expect(isPathSafe(42 as unknown as string)).toBe(false)
    expect(isPathSafe({} as unknown as string)).toBe(false)
  })

  it('rejects relative paths', () => {
    expect(isPathSafe('foo/bar.md')).toBe(false)
    expect(isPathSafe('./foo.md')).toBe(false)
    expect(isPathSafe('../foo.md')).toBe(false)
  })

  it('rejects path traversal in absolute paths', () => {
    if (isWin) {
      expect(isPathSafe('C:\\users\\me\\..\\..\\windows\\system32')).toBe(false)
    } else {
      expect(isPathSafe('/home/me/../../etc/passwd')).toBe(false)
    }
  })

  it('rejects Windows reserved device names', () => {
    if (!isWin) return
    expect(isPathSafe('C:\\NUL')).toBe(false)
    expect(isPathSafe('D:\\CON.txt')).toBe(false)
    expect(isPathSafe('C:\\COM1')).toBe(false)
  })

  it('rejects Windows extended path prefixes', () => {
    if (!isWin) return
    expect(isPathSafe('\\\\?\\C:\\foo')).toBe(false)
    expect(isPathSafe('\\\\.\\PhysicalDrive0')).toBe(false)
  })

  it('accepts absolute paths under existing directories', () => {
    // Use a path whose parent definitely exists (project cwd).
    const cwd = process.cwd()
    const candidate = `${cwd}${isWin ? '\\' : '/'}does-not-exist-${Date.now()}.md`
    expect(isPathSafe(candidate)).toBe(true)
  })
})
