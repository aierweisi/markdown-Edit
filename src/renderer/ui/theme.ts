import type { AppContext } from '../context'
import type { Theme } from '@shared/types'

const TITLEBAR_LIGHT = { color: '#ffffff', symbolColor: '#1c1e21' }
const TITLEBAR_DARK = { color: '#0d0d10', symbolColor: '#e8e8ec' }

export function applyThemeSideEffects(ctx: AppContext, theme: Theme): void {
  document.body.classList.toggle('theme-dark', theme === 'dark')
  document.body.classList.toggle('theme-light', theme !== 'dark')
  void ctx.api.updateTitleBar(theme === 'dark' ? TITLEBAR_DARK : TITLEBAR_LIGHT)
}
