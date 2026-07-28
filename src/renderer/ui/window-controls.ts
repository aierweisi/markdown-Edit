import type { AppContext } from '../context'

export function attachWindowControls(ctx: AppContext): () => void {
  if (ctx.api.platform === 'darwin') {
    document.body.classList.add('platform-mac')
    return () => undefined
  }

  const min = ctx.dom.winMinBtn
  const max = ctx.dom.winMaxBtn
  const close = ctx.dom.winCloseBtn
  const icon = ctx.dom.winMaxIcon

  function updateMaxIcon(isMax: boolean): void {
    document.body.classList.toggle('is-maximized', isMax)
    if (!icon) return
    if (isMax) {
      icon.innerHTML =
        '<rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1"/>'
      max?.setAttribute('title', '还原')
    } else {
      icon.innerHTML =
        '<rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/>'
      max?.setAttribute('title', '最大化')
    }
  }

  const onMin = (): void => void ctx.api.winMinimize()
  const onMax = (): void => void ctx.api.winToggleMaximize()
  const onClose = (): void => void ctx.api.winClose()
  min?.addEventListener('click', onMin)
  max?.addEventListener('click', onMax)
  close?.addEventListener('click', onClose)

  const unsubWin = ctx.api.onWinMaximized(updateMaxIcon)
  void ctx.api.winIsMaximized().then(updateMaxIcon)

  return () => {
    min?.removeEventListener('click', onMin)
    max?.removeEventListener('click', onMax)
    close?.removeEventListener('click', onClose)
    unsubWin()
  }
}
