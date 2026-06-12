import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve as pathResolve } from 'node:path'
import type { BrowserWindow } from 'electron'
import { EV } from '@shared/ipc'
import { isMdFile } from '@shared/paths'
import type { OpenFileFromOSPayload, OpenFileErrorPayload } from '@shared/types'

let pendingPath: string | null = null
let pendingFlag = false

export function hasPendingFile(): boolean {
  return pendingFlag
}

export function takePendingPath(): string | null {
  const p = pendingPath
  pendingPath = null
  pendingFlag = false
  return p
}

export function setPending(filePath: string): void {
  pendingPath = filePath
  pendingFlag = true
}

/**
 * Find a Markdown-like file argument in argv. Electron packaged: argv[1] is
 * usually the file path; in dev we scan from the end for resilience.
 */
export function extractFileArg(argv: string[]): string | null {
  if (!argv || argv.length === 0) return null

  if (argv[1] && !argv[1].startsWith('-') && argv[1] !== '.' && isMdFile(argv[1])) {
    try {
      if (existsSync(argv[1])) return pathResolve(argv[1])
    } catch {
      /* ignore */
    }
  }

  for (let idx = argv.length - 1; idx >= 1; idx--) {
    const arg = argv[idx]
    if (!arg || arg.startsWith('-') || arg === '.' || arg.endsWith('.js')) continue
    if (!isMdFile(arg)) continue
    try {
      if (existsSync(arg)) return pathResolve(arg)
    } catch {
      /* ignore */
    }
  }
  return null
}

export function sendOpenFile(win: BrowserWindow | null, filePath: string): void {
  if (!win) return
  try {
    const content = readFileSync(filePath, 'utf-8')
    const payload: OpenFileFromOSPayload = {
      filePath,
      content,
      name: basename(filePath),
    }
    win.webContents.send(EV.OPEN_FILE_FROM_OS, payload)
  } catch (err) {
    const errPayload: OpenFileErrorPayload = {
      filePath,
      error: err instanceof Error ? err.message : String(err),
    }
    win.webContents.send(EV.OPEN_FILE_ERROR, errPayload)
  }
}
