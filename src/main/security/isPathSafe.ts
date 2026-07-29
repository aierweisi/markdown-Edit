import { isAbsolute, normalize, resolve as pathResolve, sep, dirname } from 'node:path'
import { lstatSync } from 'node:fs'

const WIN_RESERVED_NAMES = /^[A-Z]:\\(?:NUL|CON|PRN|AUX|COM\d+|LPT\d+)(?:\.|$)/i
const WIN_DEVICE_PREFIXES = ['\\\\?\\', '\\\\.\\']

/**
 * Validate that a path is safe for file I/O originated from the renderer:
 *  - Must be a non-empty string and absolute.
 *  - Must not contain `..` traversal once normalized.
 *  - On Windows, must not point at a reserved device name or extended path prefix.
 *  - Must not be a direct symbolic link (or, when the file does not yet exist,
 *    its parent directory must not be a symbolic link).
 */
export function isPathSafe(rawPath: unknown, workspaceRoot?: string): rawPath is string {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return false
  if (!isAbsolute(rawPath)) return false

  const resolved = pathResolve(rawPath)
  if (!isAbsolute(resolved)) return false

  if (rawPath.includes('..')) {
    const normalized = normalize(rawPath)
    if (normalized !== resolved || rawPath.split(sep).some(p => p === '..')) return false
  }

  if (process.platform === 'win32') {
    const upper = resolved.toUpperCase()
    if (WIN_DEVICE_PREFIXES.some(p => upper.startsWith(p))) return false
    if (WIN_RESERVED_NAMES.test(resolved)) return false
  }

  try {
    const stat = lstatSync(resolved)
    if (stat.isSymbolicLink()) return false
  } catch {
    try {
      const dirStat = lstatSync(dirname(resolved))
      if (dirStat.isSymbolicLink()) return false
    } catch {
      return false
    }
  }

  // When a workspace root is given, confine the path to it (case-insensitive
  // on Windows). This is what scopes file-tree operations to the open folder.
  if (workspaceRoot && !isWithin(resolved, pathResolve(workspaceRoot))) return false

  return true
}

function isWithin(target: string, root: string): boolean {
  if (process.platform === 'win32') {
    const t = target.toLowerCase()
    const r = root.toLowerCase()
    return t === r || t.startsWith(r + sep)
  }
  return target === root || target.startsWith(root + sep)
}
