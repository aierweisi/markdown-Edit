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
