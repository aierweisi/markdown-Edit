import type { AppContext } from '../context'
import type { Theme } from '@shared/types'

const TITLEBAR_LIGHT = { color: '#ffffff', symbolColor: '#1c1e21' }
const TITLEBAR_DARK = { color: '#0d0d10', symbolColor: '#e8e8ec' }

/** Resolve 'auto' to the OS-preferred theme; pass explicit light/dark through. */
export function effectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function applyThemeSideEffects(ctx: AppContext, theme: Theme): void {
  const eff = effectiveTheme(theme)
  document.body.classList.toggle('theme-dark', eff === 'dark')
  document.body.classList.toggle('theme-light', eff !== 'dark')
  void ctx.api.updateTitleBar(eff === 'dark' ? TITLEBAR_DARK : TITLEBAR_LIGHT)
}
