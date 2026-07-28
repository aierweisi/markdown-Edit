import { describe, expect, it, vi } from 'vitest'
import { CH } from '@shared/ipc'
import { registerImageIpc } from '../src/main/ipc/image'

// Capture each handler registered via ipcMain.handle so we can invoke it directly.
const { handles } = vi.hoisted(() => ({ handles: new Map<string, (...a: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => {
      handles.set(ch, fn)
    },
  },
  // Not reached by the validation paths below, but image.ts imports `app`.
  app: { getPath: () => '' },
}))

registerImageIpc()

describe('image IPC: IMAGE_SAVE input validation', () => {
  const save = (req: unknown) => handles.get(CH.IMAGE_SAVE)!({} as never, req)

  it('rejects malformed request (zod)', async () => {
    await expect(save({ fileName: 'x.png' })).resolves.toMatchObject({
      success: false,
      error: 'invalid request',
    })
  })

  it('rejects a relative imageDir that escapes with ".."', async () => {
    await expect(
      save({ baseDir: null, fileName: 'x.png', dataBase64: 'AAAA', imageDir: 'a/../b' }),
    ).resolves.toMatchObject({ success: false, error: 'invalid imageDir path' })
  })

  it('rejects a request whose baseDir is the wrong type (zod)', async () => {
    await expect(
      save({ baseDir: 42, fileName: 'x.png', dataBase64: 'AAAA', imageDir: 'assets' }),
    ).resolves.toMatchObject({ success: false, error: 'invalid request' })
  })
})
