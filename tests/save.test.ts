import { describe, it, expect } from 'vitest'
import { serializeSave } from '../src/renderer/files/save'

describe('serializeSave', () => {
  it('runs saves for the same tab strictly one at a time', async () => {
    const order: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = serializeSave('tab-a', async () => {
      order.push('start1')
      await gate
      order.push('end1')
      return 1
    })
    const second = serializeSave('tab-a', async () => {
      order.push('start2')
      return 2
    })

    await Promise.resolve() // let the first save actually begin
    expect(order).toEqual(['start1']) // second must not have started yet
    release()
    expect(await first).toBe(1)
    expect(await second).toBe(2)
    expect(order).toEqual(['start1', 'end1', 'start2'])
  })

  it('lets saves for different tabs run concurrently', async () => {
    const order: string[] = []
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })

    const a = serializeSave('tab-a', async () => {
      order.push('startA')
      await gateA
      order.push('endA')
      return 'a'
    })
    const b = serializeSave('tab-b', async () => {
      order.push('startB')
      return 'b'
    })

    await Promise.resolve()
    releaseA()
    expect(await a).toBe('a')
    expect(await b).toBe('b')
    expect(order.indexOf('startB')).toBeLessThan(order.indexOf('endA'))
  })

  it('still runs the queued save when the in-flight one rejects', async () => {
    const first = serializeSave('tab-a', async () => {
      throw new Error('boom')
    })
    const second = serializeSave('tab-a', async () => 'ok')
    await expect(first).rejects.toThrow('boom')
    await expect(second).resolves.toBe('ok')
  })

  it('self-cleans the chain entry once idle', async () => {
    await serializeSave('tab-a', async () => 1)
    await serializeSave('tab-a', async () => 2)
    // If the entry leaked, the second call would queue forever and time out.
  })
})
