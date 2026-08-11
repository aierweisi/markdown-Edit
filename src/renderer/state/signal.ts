// Minimal explicit-subscription reactive primitives. No auto-tracking magic.
// Effects subscribe via the returned `subscribe` method.

export type Subscriber<T> = (next: T, prev: T) => void
export type Unsubscribe = () => void

export interface Signal<T> {
  (): T
  set(value: T | ((prev: T) => T)): void
  subscribe(fn: Subscriber<T>): Unsubscribe
}

export function createSignal<T>(initial: T): Signal<T> {
  let value = initial
  const subscribers = new Set<Subscriber<T>>()

  const signal = (() => value) as Signal<T>

  signal.set = (next: T | ((prev: T) => T)): void => {
    const resolved = typeof next === 'function' ? (next as (p: T) => T)(value) : next
    if (Object.is(resolved, value)) return
    const prev = value
    value = resolved
    subscribers.forEach((fn) => fn(value, prev))
  }

  signal.subscribe = (fn: Subscriber<T>): Unsubscribe => {
    subscribers.add(fn)
    return () => {
      subscribers.delete(fn)
    }
  }

  return signal
}
