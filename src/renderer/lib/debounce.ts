export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): (...args: Args) => void {
  let handle: ReturnType<typeof setTimeout> | null = null
  return (...args: Args): void => {
    if (handle) clearTimeout(handle)
    handle = setTimeout(() => {
      handle = null
      fn(...args)
    }, ms)
  }
}

export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): (...args: Args) => void {
  let last = 0
  let trailing: ReturnType<typeof setTimeout> | null = null
  return (...args: Args): void => {
    const now = Date.now()
    const remaining = ms - (now - last)
    if (remaining <= 0) {
      last = now
      fn(...args)
    } else {
      if (trailing) clearTimeout(trailing)
      trailing = setTimeout(() => {
        last = Date.now()
        trailing = null
        fn(...args)
      }, remaining)
    }
  }
}
