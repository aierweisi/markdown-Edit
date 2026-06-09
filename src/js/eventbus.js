/**
 * EventBus — lightweight app-wide event system
 * Replaces scattered callbacks (TabManager.onSwitch, EditorManager.onChange, etc.)
 * and bridges IPC/CustomEvent into a single interface.
 *
 * Usage:
 *   EventBus.on('tab:switch', handler)
 *   EventBus.emit('tab:switch', tab)
 *   EventBus.off('tab:switch', handler)
 *   EventBus.once('app:ready', handler)
 */
window.EventBus = (() => {
  const listeners = {}
  const onceListeners = new Set()

  function on(event, handler) {
    if (!listeners[event]) listeners[event] = []
    listeners[event].push(handler)
    return () => off(event, handler)
  }

  function off(event, handler) {
    const list = listeners[event]
    if (!list) return
    const idx = list.indexOf(handler)
    if (idx >= 0) list.splice(idx, 1)
  }

  function emit(event, data) {
    const list = listeners[event]
    if (list) {
      // 快照防止循环中 off 导致索引偏移
      const snapshot = list.slice()
      for (const handler of snapshot) {
        try {
          handler(data)
        } catch (err) {
          console.error(`[EventBus] handler error for "${event}":`, err)
        }
      }
    }
  }

  function once(event, handler) {
    const wrapper = (data) => {
      off(event, wrapper)
      onceListeners.delete(wrapper)
      handler(data)
    }
    onceListeners.add(wrapper)
    on(event, wrapper)
  }

  return { on, off, emit, once }
})()
