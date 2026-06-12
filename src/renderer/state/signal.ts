// Minimal explicit-subscription reactive primitives. No auto-tracking magic.
// Effects subscribe via the returned `subscribe` method or via createEffect(deps, fn).

export type Subscriber<T> = (next: T, prev: T) => void
export type Unsubscribe = () => void

export interface Signal<T> {
  (): T
  set(value: T | ((prev: T) => T)): void
  subscribe(fn: Subscriber<T>): Unsubscribe
  readonly _isSignal: true
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
    subscribers.forEach(fn => fn(value, prev))
  }

  signal.subscribe = (fn: Subscriber<T>): Unsubscribe => {
    subscribers.add(fn)
    return () => {
      subscribers.delete(fn)
    }
  }

  Object.defineProperty(signal, '_isSignal', { value: true, enumerable: false })
  return signal
}

/**
 * Register an effect that re-runs when any of the provided signals change.
 * Returns an unsubscribe that removes the effect from all signals.
 */
export function createEffect(
  signals: ReadonlyArray<Signal<unknown>>,
  fn: () => void,
  options: { immediate?: boolean } = {},
): Unsubscribe {
  const unsubs = signals.map(s => s.subscribe(() => fn()))
  if (options.immediate !== false) fn()
  return () => unsubs.forEach(u => u())
}

/**
 * Derive a computed value. Re-evaluates `compute` when any source signal fires.
 * Equality on the derived value is enforced via Object.is so downstream
 * subscribers only fire when the derived value actually changes.
 */
export function createMemo<T>(
  sources: ReadonlyArray<Signal<unknown>>,
  compute: () => T,
): Signal<T> {
  const memo = createSignal(compute())
  sources.forEach(s =>
    s.subscribe(() => {
      memo.set(compute())
    }),
  )
  return memo
}
