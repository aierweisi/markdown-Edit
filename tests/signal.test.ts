import { describe, expect, it, vi } from 'vitest'
import { createSignal } from '../src/renderer/state/signal'

describe('createSignal', () => {
  it('reads the initial value', () => {
    const s = createSignal(42)
    expect(s()).toBe(42)
  })

  it('updates the value via set', () => {
    const s = createSignal(1)
    s.set(2)
    expect(s()).toBe(2)
  })

  it('accepts an updater function receiving the previous value', () => {
    const s = createSignal(10)
    s.set((prev) => prev + 5)
    expect(s()).toBe(15)
  })

  it('fires subscribers on a real change with (next, prev)', () => {
    const s = createSignal('a')
    const fn = vi.fn()
    s.subscribe(fn)
    s.set('b')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('b', 'a')
  })

  it('does not fire when set to an Object.is-equal primitive', () => {
    const s = createSignal(1)
    const fn = vi.fn()
    s.subscribe(fn)
    s.set(1)
    expect(fn).not.toHaveBeenCalled()
  })

  it('does not fire when set to the same reference (mutating in place would NOT notify)', () => {
    const arr = [1, 2, 3]
    const s = createSignal(arr)
    const fn = vi.fn()
    s.subscribe(fn)
    s.set(arr) // identical reference → Object.is equal → no notification
    expect(fn).not.toHaveBeenCalled()
  })

  it('treats NaN→NaN as unchanged (Object.is, not ===)', () => {
    const s = createSignal(NaN)
    const fn = vi.fn()
    s.subscribe(fn)
    s.set(NaN)
    expect(fn).not.toHaveBeenCalled()
  })

  it('treats 0→-0 as a change (Object.is distinguishes them)', () => {
    const s = createSignal(0)
    const fn = vi.fn()
    s.subscribe(fn)
    s.set(-0)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe stops further notifications', () => {
    const s = createSignal(0)
    const fn = vi.fn()
    const unsub = s.subscribe(fn)
    s.set(1)
    expect(fn).toHaveBeenCalledTimes(1)
    unsub()
    s.set(2)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
